/**
 * Everything about how the receipt looks, in one file.
 *
 * ## Why this file is the only place with print measurements
 *
 * The receipt is rendered exactly once — `ReceiptDoc` → `next/og` → a PNG at
 * `HEAD_DOTS` wide. That same PNG is what the runner previews on their phone
 * and what the Pi rasterises onto paper. There is no second layout pass, so
 * there is nothing to keep in sync. Change a number here and both the preview
 * and the print move together.
 *
 * ## Print units are not screen units
 *
 * Every number below is a **device pixel on the print head**, not a rem. The
 * site's `--text-*` tokens are fluid rem values tuned for a viewport; paper is
 * a fixed 384-dot grid. Mixing them would mean a receipt whose layout changes
 * with the phone's font size, which is exactly the bug we're avoiding.
 *
 * Likewise `INK` is pure `#000`, not the site's `--black` (`#1a1a1a`). A
 * thermal head is 1-bit: it burns a dot or it doesn't. `#1a1a1a` thresholds to
 * black anyway, so the only thing the near-black would change is the
 * anti-aliased edge pixels around glyphs — making them slightly more likely to
 * land on the wrong side of the threshold and fur up the text.
 */

/**
 * Print-head width in dots. 384 = standard 58mm thermal at 203 DPI.
 * Bump to 576 for an 80mm printer and everything below reflows.
 */
export const HEAD_DOTS = 384;

/** Horizontal breathing room. Thermal heads are unreliable at the very edge. */
export const PAD = 8;

/** Usable width inside the padding — what text wraps to and photos scale to. */
export const CONTENT_WIDTH = HEAD_DOTS - PAD * 2;

/** Print colours. See the note above on why this is #000 and not --black. */
export const INK = "#000000";
export const PAPER = "#ffffff";

/**
 * Type scale, in print pixels. Sizes are close together on purpose — the
 * receipt gets its hierarchy from casing, tracking and rules, the same way the
 * site does, not from big type.
 */
export const TYPE = {
  hero: 34,
  brand: 16,
  body: 13,
  label: 11,
  micro: 10,
} as const;

/**
 * Line height per type size. Kept explicit rather than derived so
 * `estimateReceiptHeight` and the renderer can never disagree.
 */
export const LINE_H: Record<keyof typeof TYPE, number> = {
  hero: 38,
  brand: 22,
  body: 18,
  label: 16,
  micro: 14,
};

/** Letter-spacing, in em, mirroring the site's tracking ladder. */
export const TRACKING = {
  hero: "0.02em",
  brand: "0.2em",
  body: "0.02em",
  label: "0.15em",
  micro: "0.3em",
} as const;

/** Vertical rhythm. */
export const GAP = {
  /** Between stacked photos. */
  photo: 8,
  /** Above and below a horizontal rule. */
  rule: 12,
  /** Between major blocks. */
  section: 16,
};

/** Blank dot-rows fed after the receipt so it clears the tear bar. */
export const FEED_LINES = 6;

/**
 * The route signature — the GPS track drawn as a single line.
 *
 * Decoded from the activity's `summary_polyline` (see `lib/polyline.ts`) and
 * embedded as an SVG. `stroke` stays at 2: a 1px stroke is half-covered by
 * anti-aliasing, which lands it on the wrong side of the print threshold and
 * prints as a broken, grey trail.
 */
export const ROUTE = {
  label: "ROUTE SIGNATURE",
  width: CONTENT_WIDTH,
  height: 200,
  stroke: 2,
  padding: 6,
} as const;

/** Photos are dithered to exactly this width and placed 1:1. Never resampled. */
export const PHOTO_WIDTH = CONTENT_WIDTH;

/** Hard cap on runner-supplied photos. */
export const MAX_RUNNER_PHOTOS = 3;

/**
 * Photo tone mapping, applied before dithering.
 *
 * These are lifted from the photobooth's Pi server (`_prep_photo_for_thermal`)
 * where they were tuned against this exact printer. Thermal heads threshold
 * around 50% gray, so faces collapse into black blobs unless the midtones are
 * lifted hard — hence the aggressive gamma.
 */
export const TONE = {
  brightness: 1.4,
  gamma: 2.4,
  sharpness: 2.0,
  contrast: 0.9,
} as const;

/**
 * The masthead artwork that opens every receipt.
 *
 * A pre-rendered 1-bit bitmap rather than type, for the same reason photos are
 * dithered in the browser: it arrives already pure black and white, so the
 * Pi's threshold leaves it byte-identical and nothing can soften it.
 *
 * `width`/`height` must match the file's real pixel size — satori places it at
 * exactly these dimensions, and any mismatch resamples it, which would chew up
 * the halftone detail in the artwork.
 *
 * To swap it: run the source art through the same treatment — downscale to
 * `CONTENT_WIDTH` with Lanczos, then a hard threshold around 128. Thresholding
 * beats dithering here; the art is already high-contrast, and error diffusion
 * makes it print too light.
 */
export const MASTHEAD = {
  /** Path under the repo root. Read at render time and inlined as a data URI. */
  file: "public/receipt/masthead.png",
  width: CONTENT_WIDTH,
  height: 417,
} as const;

/** Shop details, printed at the foot of every receipt. */
export const FOOTER_LINES = [
  "ACTIVE CULTURES",
  "925 E 900 S",
  "SLC, UT",
] as const;

/**
 * Attribution.
 *
 * The Garmin line is required by a clause in the Strava API agreement and
 * prints whenever the activity reports a Garmin device — see
 * `garminAttribution`.
 *
 * `strava` is deliberately not rendered at the moment. Note that Strava's
 * agreement expects attribution on anything displaying its data, and app
 * review — which you need to pass to go beyond ten connected athletes — is
 * where its absence would surface. Kept here so putting it back is a one-line
 * change in `ReceiptDoc` rather than a rewrite.
 */
export const ATTRIBUTION = {
  strava: "POWERED BY STRAVA",
  garmin: "ACTIVITY DATA FROM GARMIN",
} as const;

/**
 * Photos printed on every receipt regardless of what the runner picked —
 * the shop front door, etc. Paths are relative to `public/`.
 *
 * These go through the identical dither path as runner photos: they're
 * same-origin, so the canvas can read them back without tainting.
 */
export const HOUSE_PHOTOS: readonly string[] = [
  // e.g. "/receipt/front-door.jpg",
];

/**
 * The Strava API agreement requires attributing Garmin when the displayed
 * activity data came off a Garmin device.
 */
export function garminAttribution(deviceName?: string | null): string | null {
  if (!deviceName) return null;
  return /garmin/i.test(deviceName) ? ATTRIBUTION.garmin : null;
}
