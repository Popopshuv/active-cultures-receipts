/**
 * Validate an untrusted receipt payload.
 *
 * The payload is assembled on the runner's phone and posted back, so it is
 * attacker-controlled in the ordinary sense: anyone who can reach the site can
 * send whatever they like here.
 *
 * The one that actually bites is **photo sources**. Satori fetches any URL it
 * finds in an `<img src>`, server-side, from inside our own network. A payload
 * carrying `src: "http://169.254.169.254/..."` would turn the preview endpoint
 * into an SSRF proxy. So `src` is restricted to `data:image/` URIs — the only
 * thing the photo pipeline ever produces anyway.
 */

import { MAX_RUNNER_PHOTOS, PHOTO_WIDTH } from "./receiptConfig";
import type { ReceiptPayload, ReceiptPhoto, ReceiptStat } from "./receiptPayload";

/** Belt and braces against a payload that tries to exhaust memory. */
const LIMITS = {
  text: 120,
  stats: 12,
  footerLines: 6,
  /** Roughly 1MB of base64 per photo — far above a real 1-bit 368px PNG. */
  photoBytes: 1_000_000,
  polyline: 100_000,
  /** Nothing legitimate is taller than a couple of metres of paper. */
  photoHeight: 2000,
};

export class ReceiptPayloadError extends Error {}

function str(value: unknown, field: string, max = LIMITS.text): string {
  if (typeof value !== "string") {
    throw new ReceiptPayloadError(`${field} must be a string`);
  }
  return value.slice(0, max);
}

function optionalStr(
  value: unknown,
  field: string,
  max = LIMITS.text,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return str(value, field, max);
}

function parseStat(value: unknown, i: number): ReceiptStat {
  if (typeof value !== "object" || value === null) {
    throw new ReceiptPayloadError(`stats[${i}] must be an object`);
  }
  const raw = value as Record<string, unknown>;
  return {
    label: str(raw.label, `stats[${i}].label`),
    value: str(raw.value, `stats[${i}].value`),
    indent: raw.indent === true,
  };
}

function parsePhoto(value: unknown, i: number): ReceiptPhoto {
  if (typeof value !== "object" || value === null) {
    throw new ReceiptPayloadError(`photos[${i}] must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const src = raw.src;

  if (typeof src !== "string" || !src.startsWith("data:image/")) {
    // See the header note — this is the SSRF guard, not a formatting nicety.
    throw new ReceiptPayloadError(
      `photos[${i}].src must be a data:image/ URI`,
    );
  }
  if (src.length > LIMITS.photoBytes) {
    throw new ReceiptPayloadError(`photos[${i}].src is too large`);
  }

  const height = Number(raw.height);
  if (!Number.isFinite(height) || height <= 0 || height > LIMITS.photoHeight) {
    throw new ReceiptPayloadError(`photos[${i}].height is out of range`);
  }

  return { src, height: Math.round(height) };
}

/**
 * Coerce unknown JSON into a `ReceiptPayload`, or throw `ReceiptPayloadError`.
 *
 * Photos beyond `MAX_RUNNER_PHOTOS` are dropped rather than rejected: a runner
 * who somehow picked a fourth photo should get a receipt, not an error page.
 */
export function parseReceiptPayload(input: unknown): ReceiptPayload {
  if (typeof input !== "object" || input === null) {
    throw new ReceiptPayloadError("payload must be an object");
  }
  const raw = input as Record<string, unknown>;

  const statsInput = Array.isArray(raw.stats) ? raw.stats : [];
  const photosInput = Array.isArray(raw.photos) ? raw.photos : [];
  const footerInput = Array.isArray(raw.footerLines) ? raw.footerLines : [];

  let hero: ReceiptPayload["hero"];
  if (raw.hero && typeof raw.hero === "object") {
    const h = raw.hero as Record<string, unknown>;
    hero = {
      label: str(h.label, "hero.label"),
      rowLabel: str(h.rowLabel, "hero.rowLabel"),
      value: str(h.value, "hero.value"),
    };
  }

  let total: ReceiptPayload["total"];
  if (raw.total && typeof raw.total === "object") {
    const t = raw.total as Record<string, unknown>;
    total = {
      label: str(t.label, "total.label"),
      value: str(t.value, "total.value"),
      note: optionalStr(t.note, "total.note"),
    };
  }

  return {
    title: str(raw.title, "title"),
    subtitle: optionalStr(raw.subtitle, "subtitle"),
    dateLine: optionalStr(raw.dateLine, "dateLine"),
    hero,
    stats: statsInput.slice(0, LIMITS.stats).map(parseStat),
    total,
    polyline: optionalStr(raw.polyline, "polyline", LIMITS.polyline) ?? null,
    photos: photosInput.slice(0, MAX_RUNNER_PHOTOS + 3).map(parsePhoto),
    footerLines: footerInput
      .slice(0, LIMITS.footerLines)
      .map((l, i) => str(l, `footerLines[${i}]`)),
    deviceName: optionalStr(raw.deviceName, "deviceName") ?? null,
    ticket: str(raw.ticket, "ticket", 24),
    stamp: str(raw.stamp, "stamp", 40),
  };
}

/** Width every photo is expected to have been dithered to. */
export const EXPECTED_PHOTO_WIDTH = PHOTO_WIDTH;
