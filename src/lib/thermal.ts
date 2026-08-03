/**
 * Photo → 1-bit thermal bitmap, in the browser.
 *
 * ## Why the dithering happens here and not on the Pi
 *
 * A thermal head burns a dot or it doesn't — there is no grey. Something has
 * to decide, per pixel, which it is. The obvious place is the Pi, which is
 * what the photobooth does. But the receipt is composed *before* it reaches
 * the Pi, so by then the photo is baked into a bitmap that also contains text.
 * Dithering that composite error-diffuses across the anti-aliased edges of
 * every glyph and furs up the type.
 *
 * So photos are reduced to pure black and white here, at exactly the width
 * they'll print at. The composite that reaches the Pi is then already
 * effectively 1-bit, and the Pi only has to threshold — an operation that
 * leaves both crisp text and an existing dither pattern untouched.
 *
 * The corollary, which the renderer depends on: **a dithered photo must never
 * be resampled.** Scaling it even slightly averages neighbouring dots back
 * into greys and undoes all of this. `ReceiptDoc` places these at their native
 * size for exactly this reason.
 *
 * ## The tone curve
 *
 * `TONE` is ported verbatim from the photobooth's Pi server, where it was
 * tuned against this printer. The operations are applied in Pillow's order —
 * brightness, sharpness, contrast, gamma — because the constants were fitted
 * to that sequence and reordering them changes the result.
 */

import { PHOTO_WIDTH, TONE } from "./receiptConfig";
import type { ReceiptPhoto } from "./receiptPayload";

/** Longest edge we'll accept before downscaling, to bound the work. */
const MAX_SOURCE_EDGE = 2400;

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Decode a photo, honouring EXIF orientation.
 *
 * `imageOrientation: "from-image"` is doing real work here: phone cameras
 * routinely store a landscape sensor read plus a rotation flag, and without
 * this every portrait photo prints on its side.
 */
async function decode(source: Blob | string): Promise<ImageBitmap> {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`photo fetch failed: ${response.status}`);
    }
    return createImageBitmap(await response.blob(), {
      imageOrientation: "from-image",
    });
  }
  return createImageBitmap(source, { imageOrientation: "from-image" });
}

/** Rec. 601 luma — the same weighting Pillow's `convert("L")` uses. */
function toGrayscale(data: Uint8ClampedArray): Float32Array {
  const gray = new Float32Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Flatten any transparency onto white first. An alpha channel left as-is
    // reads as black and prints as a solid slab.
    const alpha = data[i + 3] / 255;
    const r = data[i] * alpha + 255 * (1 - alpha);
    const g = data[i + 1] * alpha + 255 * (1 - alpha);
    const b = data[i + 2] * alpha + 255 * (1 - alpha);
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/** Pillow's `ImageEnhance.Brightness`: blend towards black. */
function applyBrightness(gray: Float32Array, factor: number): void {
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.min(255, Math.max(0, gray[i] * factor));
  }
}

/**
 * Pillow's `ImageEnhance.Sharpness`: blend away from a smoothed copy.
 *
 * Pillow smooths with the 3×3 kernel `[[1,1,1],[1,5,1],[1,1,1]] / 13`, then
 * interpolates: `result = smooth + factor × (original − smooth)`. At the
 * factor of 2.0 we inherit, that's a plain unsharp mask — which matters on a
 * 1-bit print, where edge contrast is most of what survives.
 */
function applySharpness(
  gray: Float32Array,
  width: number,
  height: number,
  factor: number,
): void {
  if (factor === 1) return;
  const original = Float32Array.from(gray);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Pillow leaves the 1px border untouched rather than extending edges.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;

      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const weight = dx === 0 && dy === 0 ? 5 : 1;
          sum += original[(y + dy) * width + (x + dx)] * weight;
        }
      }
      const smooth = sum / 13;
      gray[i] = Math.min(255, Math.max(0, smooth + factor * (original[i] - smooth)));
    }
  }
}

/** Pillow's `ImageEnhance.Contrast`: blend towards the image's mean grey. */
function applyContrast(gray: Float32Array, factor: number): void {
  if (factor === 1) return;
  let total = 0;
  for (let i = 0; i < gray.length; i++) total += gray[i];
  const mean = Math.round(total / gray.length);

  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.min(255, Math.max(0, mean + factor * (gray[i] - mean)));
  }
}

/**
 * Gamma lift.
 *
 * The big one. Thermal heads threshold around 50% grey, so without pulling the
 * midtones up hard, every face turns into a black blob.
 */
function applyGamma(gray: Float32Array, gamma: number): void {
  const inv = 1 / Math.max(0.1, gamma);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, 255 * (i / 255) ** inv);
  }
  for (let i = 0; i < gray.length; i++) {
    gray[i] = lut[Math.round(Math.min(255, Math.max(0, gray[i])))];
  }
}

/**
 * Floyd–Steinberg error diffusion to pure black and white.
 *
 * Error is pushed right and down in the classic 7/3/5/1 proportions. Writes
 * straight back into the RGBA buffer.
 */
function ditherInto(
  gray: Float32Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const next = old < 128 ? 0 : 255;
      const error = old - next;
      gray[i] = next;

      if (x + 1 < width) gray[i + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (error * 3) / 16;
        gray[i + width] += (error * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += (error * 1) / 16;
      }

      const p = i * 4;
      data[p] = next;
      data[p + 1] = next;
      data[p + 2] = next;
      data[p + 3] = 255;
    }
  }
}

/**
 * Convert a photo into a print-ready `ReceiptPhoto`.
 *
 * Accepts a `Blob` (camera roll) or a same-origin URL (house photos, or a
 * Strava image coming through `/api/strava/photo` — a cross-origin URL taints
 * the canvas and makes `getImageData` throw).
 *
 * The returned bitmap is exactly `targetWidth` wide and pure black and white.
 */
export async function toThermalPhoto(
  source: Blob | string,
  targetWidth: number = PHOTO_WIDTH,
): Promise<ReceiptPhoto> {
  const bitmap = await decode(source);

  try {
    if (bitmap.width === 0 || bitmap.height === 0) {
      throw new Error("photo has no pixels");
    }

    // Two-step downscale: get into a sane range first, then land exactly on
    // the print width. Going straight from a 12MP phone photo to 368px in one
    // drawImage aliases badly on some browsers.
    let sourceW = bitmap.width;
    let sourceH = bitmap.height;
    if (Math.max(sourceW, sourceH) > MAX_SOURCE_EDGE) {
      const factor = MAX_SOURCE_EDGE / Math.max(sourceW, sourceH);
      sourceW = Math.round(sourceW * factor);
      sourceH = Math.round(sourceH * factor);
    }

    const width = targetWidth;
    const height = Math.max(1, Math.round((sourceH / sourceW) * width));

    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d canvas unavailable");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const gray = toGrayscale(imageData.data);

    // Pillow's order. Don't reshuffle — TONE was fitted to this sequence.
    applyBrightness(gray, TONE.brightness);
    applySharpness(gray, width, height, TONE.sharpness);
    applyContrast(gray, TONE.contrast);
    applyGamma(gray, TONE.gamma);
    ditherInto(gray, imageData.data, width, height);

    ctx.putImageData(imageData, 0, 0);

    return { src: canvas.toDataURL("image/png"), height };
  } finally {
    bitmap.close();
  }
}

export interface ThermalBatch {
  photos: ReceiptPhoto[];
  /** How many sources failed to convert. */
  failed: number;
  /** First failure's message, for showing the user something specific. */
  reason?: string;
}

/**
 * Convert several photos.
 *
 * One bad photo shouldn't cost the others, so failures are dropped rather
 * than thrown — but the count comes back so the caller can say so. Silently
 * dropping them means a runner picks three photos, gets a receipt with none,
 * and has no idea why.
 */
export async function toThermalPhotos(
  sources: readonly (Blob | string)[],
  targetWidth: number = PHOTO_WIDTH,
): Promise<ThermalBatch> {
  const results = await Promise.allSettled(
    sources.map((source) => toThermalPhoto(source, targetWidth)),
  );

  const photos: ReceiptPhoto[] = [];
  let failed = 0;
  let reason: string | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      photos.push(result.value);
      continue;
    }
    failed += 1;
    reason ??=
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn("[thermal] photo skipped:", result.reason);
  }

  return { photos, failed, reason };
}
