/**
 * Payload → PNG.
 *
 * The single rasterisation point. Both the preview endpoint and the print
 * endpoint call this, which is what guarantees the runner's phone and the
 * thermal head are looking at the same bitmap.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ReceiptDoc } from "@/components/receipt/ReceiptDoc";
import { HEAD_DOTS } from "./receiptConfig";
import { estimateReceiptHeight } from "./receiptHeight";
import type { ReceiptPayload } from "./receiptPayload";

/**
 * Read the wordmark font once per process.
 *
 * `woff` and not `woff2` — satori parses `ttf`, `otf` and `woff` only, which
 * is why `public/fonts/` carries both formats and why this path is not the one
 * the stylesheet prefers.
 */
let fontPromise: Promise<ArrayBuffer | undefined> | undefined;

function loadFont(): Promise<ArrayBuffer | undefined> {
  fontPromise ??= readFile(
    join(process.cwd(), "public/fonts/ABCMonumentGroteskMono-Light.woff"),
  )
    .then(
      (buf) =>
        buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer,
    )
    .catch(() => {
      // Without the face, satori falls back to its bundled sans. The receipt
      // still prints — it just isn't ours. Loud enough to notice in logs.
      console.warn("[receipt] ABC Monument woff missing — falling back to sans");
      return undefined;
    });
  return fontPromise;
}

/**
 * Render a receipt to a PNG response.
 *
 * Height comes from `estimateReceiptHeight`, which deliberately over-estimates;
 * the Pi crops the trailing white before printing.
 */
export async function renderReceipt(payload: ReceiptPayload): Promise<ImageResponse> {
  const fontData = await loadFont();

  return new ImageResponse(<ReceiptDoc payload={payload} />, {
    width: HEAD_DOTS,
    height: estimateReceiptHeight(payload),
    fonts: fontData
      ? [
          {
            name: "ABCMonumentGrotesk",
            data: fontData,
            weight: 300,
            style: "normal",
          },
        ]
      : undefined,
    headers: {
      // The bitmap is derived entirely from the payload, and a receipt is
      // printed once. Nothing here should ever come from a cache.
      "Cache-Control": "no-store",
    },
  });
}

/** Same render, as raw bytes — for forwarding to the Pi. */
export async function renderReceiptBytes(
  payload: ReceiptPayload,
): Promise<ArrayBuffer> {
  const response = await renderReceipt(payload);
  return response.arrayBuffer();
}
