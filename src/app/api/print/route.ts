/**
 * Print a receipt.
 *
 * Renders the payload server-side and forwards the PNG to the Pi. The runner's
 * phone never touches the print server, so the shared token stays a server
 * secret.
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
import { deauthorize } from "@/lib/strava";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withSession(request, async (session) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }

    let payload;
    try {
      payload = parseReceiptPayload(body);
    } catch (error) {
      if (error instanceof ReceiptPayloadError) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 400 },
        );
      }
      throw error;
    }

    let jobId: number;
    try {
      const png = await renderReceiptBytes(payload);
      jobId = await submitJob(png, {
        ticket: payload.ticket,
        label: payload.title,
      });
    } catch (error) {
      if (error instanceof PrinterOfflineError) {
        return NextResponse.json(
          { ok: false, error: "printer offline", offline: true },
          { status: 503 },
        );
      }
      console.error("[print] failed", error);
      return NextResponse.json({ ok: false, error: "print failed" }, { status: 502 });
    }

    // Queued and durable on the Pi. Everything past this point is cleanup.
    const revoked = await deauthorize(session.accessToken);

    const response = NextResponse.json({ ok: true, jobId, revoked });
    // The token is gone, so the cookie holding it is worthless — and leaving a
    // dead session behind would show the next person a broken run list.
    return clearSession(response);
  });
}
