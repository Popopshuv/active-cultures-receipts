/**
 * Receipt preview — payload in, PNG out.
 *
 * `GET /api/receipt?sample=1` renders the fixture, which is the fastest way to
 * iterate on layout: change `receiptConfig.ts`, refresh the tab, see the exact
 * bitmap that would print.
 *
 * `POST /api/receipt` renders a real payload. The runner's phone shows the
 * response directly, so what they approve is what the thermal head receives.
 */

import { NextResponse } from "next/server";
import { SAMPLE_RUN } from "@/lib/fixtures/sampleRun";
import {
  ReceiptPayloadError,
  parseReceiptPayload,
} from "@/lib/parseReceiptPayload";
import { renderReceipt } from "@/lib/renderReceipt";

// Needs the Node runtime: the font is read off disk with node:fs.
export const runtime = "nodejs";

export async function GET() {
  return renderReceipt(SAMPLE_RUN);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    return await renderReceipt(parseReceiptPayload(body));
  } catch (error) {
    if (error instanceof ReceiptPayloadError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    console.error("[receipt] render failed", error);
    return NextResponse.json({ ok: false, error: "render failed" }, { status: 500 });
  }
}
