/**
 * A stand-in run, so the whole print pipeline can be exercised without Strava.
 *
 * This is what the operator's test print uses and what you POST at
 * `/api/receipt` while tuning the layout. It matters more than a normal
 * fixture does: Strava's athlete cap means there are stretches where this is
 * the *only* way to put a realistic receipt in front of the printer.
 */

import { FOOTER_LINES } from "../receiptConfig";
import type { ReceiptPayload } from "../receiptPayload";

/**
 * Encode lat/lng pairs into Google's polyline format.
 *
 * The inverse of `decodePolyline`, and needed only here — real payloads arrive
 * already encoded from Strava. Kept local so nothing in the app can start
 * depending on a fixture helper.
 */
function encodePolyline(points: readonly (readonly [number, number])[]): string {
  const chunk = (value: number): string => {
    // Zig-zag so the sign rides in the low bit, then emit 5-bit groups with a
    // continuation flag on all but the last.
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = "";
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
    return out;
  };

  let lastLat = 0;
  let lastLng = 0;
  let encoded = "";
  for (const [lat, lng] of points) {
    const eLat = Math.round(lat * 1e5);
    const eLng = Math.round(lng * 1e5);
    encoded += chunk(eLat - lastLat) + chunk(eLng - lastLng);
    lastLat = eLat;
    lastLng = eLng;
  }
  return encoded;
}

/**
 * A loop around Liberty Park — a block from the shop, and roughly the shape of
 * the club's actual four-mile route.
 *
 * Deterministic on purpose: the wobble comes from a fixed sine term rather
 * than `Math.random`, so two renders of the fixture produce identical bitmaps
 * and a layout change is the only thing that can move a pixel.
 */
function libertyParkLoop(): string {
  const centreLat = 40.7459;
  const centreLng = -111.8756;
  const radiusLat = 0.0075;
  const radiusLng = 0.0052;

  const points: [number, number][] = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Two out-of-phase harmonics keep it from reading as a clean ellipse.
    const wobble = 1 + 0.06 * Math.sin(t * 5) + 0.03 * Math.sin(t * 11 + 1.2);
    points.push([
      centreLat + Math.sin(t) * radiusLat * wobble,
      centreLng + Math.cos(t) * radiusLng * wobble,
    ]);
  }
  return encodePolyline(points);
}

export const SAMPLE_RUN: ReceiptPayload = {
  title: "Ice Cream Social Run",
  subtitle: "Salt Lake City, Utah",
  dateLine: "Monday, August 3, 2026 at 7:04 PM",
  hero: {
    label: "NO. MILES",
    rowLabel: "1 RUN",
    value: "4.02",
  },
  stats: [
    { label: "PACE", value: "9:31 /MI", indent: true },
    { label: "MOVING TIME", value: "38:16", indent: true },
    { label: "ELEVATION GAIN", value: "212 FT", indent: true },
    { label: "AVG HEART RATE", value: "148 BPM", indent: true },
  ],
  total: {
    label: "TOTAL MILES",
    value: "4.02",
    note: "(NO ONE LEFT BEHIND)",
  },
  polyline: libertyParkLoop(),
  photos: [],
  footerLines: FOOTER_LINES,
  deviceName: "Garmin Forerunner 265",
  ticket: "#0001",
  stamp: "2026-08-03 19:42",
};
