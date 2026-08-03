/**
 * Print a receipt.
 *
 * Renders the payload server-side and forwards the PNG to the Pi. The runner's
 * phone never touches the print server, so the shared token stays a server
 * secret.
 *
 * ## Two ways in
 *
 * A Strava session, or the short-lived cookie from `/api/manual/start` for
 * runners filling the form by hand. Both spend their credential on the way out:
 * the Strava path hands the authorisation back to Strava, the manual path drops
 * its cookie. One credential, one receipt, either way.
 *
 * ## The ordering here is deliberate
 *
 * Render → queue → *then* hand the Strava authorisation back. Deauthorising
 * any earlier would mean a failed queue submission couldn't be retried without
 * sending the runner through the consent screen again. Deauthorising at all is
 * what keeps the app's connected-athlete count near zero — see `lib/strava.ts`
 * for why that matters at a club with more than ten runners.
 *
 * The revocation is best-effort and never turns a successful print into an
 * error. Paper already came out; reporting failure would be a lie.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clearSession, withSession } from "@/lib/apiSession";
import {
  ReceiptPayloadError,
  parseReceiptPayload,
} from "@/lib/parseReceiptPayload";
import { renderReceiptBytes } from "@/lib/renderReceipt";
import { PrinterOfflineError, submitJob } from "@/lib/piClient";
import { manualCookie } from "@/lib/session";
import { deauthorize } from "@/lib/strava";

export const runtime = "nodejs";

/**
 * Validate, render and queue.
 *
 * Returns either the job id or the response to send back, so both callers get
 * identical status codes for a bad payload, a full queue or a dead printer.
 */
async function queueReceipt(
  request: NextRequest,
): Promise<{ jobId: number } | { failure: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      failure: NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 }),
    };
  }

  let payload;
  try {
    payload = parseReceiptPayload(body);
  } catch (error) {
    if (error instanceof ReceiptPayloadError) {
      return {
        failure: NextResponse.json(
          { ok: false, error: error.message },
          { status: 400 },
        ),
      };
    }
    throw error;
  }

  try {
    const png = await renderReceiptBytes(payload);
    const jobId = await submitJob(png, {
      ticket: payload.ticket,
      label: payload.title,
    });
    return { jobId };
  } catch (error) {
    if (error instanceof PrinterOfflineError) {
      return {
        failure: NextResponse.json(
          { ok: false, error: "printer offline", offline: true },
          { status: 503 },
        ),
      };
    }
    console.error("[print] failed", error);
    return {
      failure: NextResponse.json({ ok: false, error: "print failed" }, { status: 502 }),
    };
  }
}

export async function POST(request: NextRequest) {
  // Checked before the Strava session so a hand-filled receipt never gets a
  // "not connected" 401 for a connection it was never going to have.
  const manual = manualCookie.read(request.cookies.get(manualCookie.name)?.value);

  if (manual) {
    const result = await queueReceipt(request);
    if ("failure" in result) return result.failure;

    const response = NextResponse.json({ ok: true, jobId: result.jobId });
    // Spent. Leaving it would let one visit print all afternoon.
    response.cookies.delete(manualCookie.name);
    return response;
  }

  return withSession(request, async (session) => {
    const result = await queueReceipt(request);
    if ("failure" in result) return result.failure;

    // Queued and durable on the Pi. Everything past this point is cleanup.
    const revoked = await deauthorize(session.accessToken);

    const response = NextResponse.json({ ok: true, jobId: result.jobId, revoked });
    // The token is gone, so the cookie holding it is worthless — and leaving a
    // dead session behind would show the next person a broken run list.
    return clearSession(response);
  });
}
