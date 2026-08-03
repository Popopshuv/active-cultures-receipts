/**
 * How tall to make the canvas.
 *
 * `ImageResponse` wants a fixed height — it defaults to 630 rather than
 * sizing to content — so we have to decide the canvas height before rendering
 * a receipt whose length depends on how many photos and stats it carries.
 *
 * ## This is an upper bound on purpose
 *
 * The two failure modes are not symmetric:
 *
 * - **Too short** clips the bottom off the receipt. Unrecoverable.
 * - **Too tall** leaves white space, which the Pi crops off before printing
 *   (`_autocrop` in `pi-server/app.py`). Costs nothing.
 *
 * So this deliberately over-estimates and lets the crop clean up. Don't
 * "tighten" these numbers to match the renderer exactly — the slack is the
 * safety margin that stops a long activity name from truncating a receipt.
 */

import {
  CONTENT_WIDTH,
  GAP,
  LINE_H,
  ROUTE,
  TYPE,
  TRACKING,
} from "./receiptConfig";
import type { ReceiptPayload } from "./receiptPayload";

/**
 * Rough advance width of one character, as a fraction of font size.
 *
 * ABC Monument Grotesk Mono is monospaced at ~0.6em. Tracking is added on top
 * because letter-spacing widens every advance, which is easy to forget and is
 * exactly what makes a tracked heading wrap one line earlier than expected.
 */
function charAdvance(size: number, trackingEm: number): number {
  return size * (0.6 + trackingEm);
}

function trackingToEm(tracking: string): number {
  return Number.parseFloat(tracking.replace("em", "")) || 0;
}

/** How many lines a string wraps to at a given size. */
function wrappedLines(
  text: string | undefined | null,
  size: number,
  tracking: string,
  width = CONTENT_WIDTH,
): number {
  if (!text) return 0;
  const perLine = Math.max(1, Math.floor(width / charAdvance(size, trackingToEm(tracking))));
  return Math.max(1, Math.ceil(text.length / perLine));
}

/** Vertical space taken by a rule plus the air either side of it. */
const RULE_BLOCK = GAP.rule * 2 + 1;

/**
 * Estimated canvas height for a payload, in print pixels.
 *
 * Walks the same blocks the renderer emits, then pads. See the note above on
 * why the padding is not a rounding error.
 */
export function estimateReceiptHeight(payload: ReceiptPayload): number {
  let h = 0;

  // Masthead.
  h += LINE_H.brand;
  h += LINE_H.micro;
  h += GAP.section;

  // Title block.
  h += wrappedLines(payload.title, TYPE.brand, TRACKING.brand) * LINE_H.brand;
  h += wrappedLines(payload.subtitle, TYPE.body, TRACKING.body) * LINE_H.body;
  h += wrappedLines(payload.dateLine, TYPE.label, TRACKING.label) * LINE_H.label;

  // Itemised block.
  h += RULE_BLOCK;
  if (payload.hero) {
    h += LINE_H.label;
    h += LINE_H.brand;
  }
  h += payload.stats.length * LINE_H.body;

  if (payload.total) {
    h += RULE_BLOCK;
    h += LINE_H.brand;
    if (payload.total.note) h += LINE_H.micro;
  }

  // Route signature.
  if (payload.polyline) {
    h += RULE_BLOCK;
    h += LINE_H.label;
    h += ROUTE.height;
  }

  // Photo stack.
  if (payload.photos.length > 0) {
    h += RULE_BLOCK;
    h += payload.photos.reduce((sum, p) => sum + p.height, 0);
    h += GAP.photo * Math.max(0, payload.photos.length - 1);
  }

  // Footer, attribution, stamp.
  h += RULE_BLOCK;
  const footerCount = payload.footerLines?.length ?? 0;
  h += footerCount * LINE_H.label;
  // Strava attribution always prints; Garmin sometimes does. Count both so a
  // Garmin activity can never be the thing that overflows.
  h += 2 * LINE_H.micro;
  h += GAP.section;
  h += LINE_H.micro;

  // Slack, then the vertical padding the document itself adds.
  return Math.max(400, Math.ceil(h * 1.15) + 48);
}
