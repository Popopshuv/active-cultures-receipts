/**
 * Strava activity → receipt payload.
 *
 * Pure and isomorphic: no server imports, no clock reads of its own. The
 * caller supplies `stamp`, which matters more than it looks — the payload is
 * built once on the runner's phone and then posted twice, once to render the
 * preview and once to print. Reading the clock in here would make those two
 * renders differ and quietly break the guarantee that what they approved is
 * what comes out of the printer.
 */

import { FOOTER_LINES } from "./receiptConfig";
import type { ReceiptPayload, ReceiptPhoto, ReceiptStat } from "./receiptPayload";
import type { StravaActivity } from "./strava";

const METRES_PER_MILE = 1609.344;
const FEET_PER_METRE = 3.28084;

/** Distance in miles, two decimals — the figure the receipt leads with. */
export function miles(metres: number): string {
  return (metres / METRES_PER_MILE).toFixed(2);
}

/** Duration as `h:mm:ss`, dropping the hour when there isn't one. */
export function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Pace as `m:ss /MI`. */
export function pace(metres: number, seconds: number): string | null {
  if (metres <= 0 || seconds <= 0) return null;
  const secondsPerMile = seconds / (metres / METRES_PER_MILE);
  if (!Number.isFinite(secondsPerMile)) return null;
  const m = Math.floor(secondsPerMile / 60);
  const s = Math.round(secondsPerMile % 60);
  // 9:60 is not a pace.
  const carry = s === 60;
  return `${carry ? m + 1 : m}:${String(carry ? 0 : s).padStart(2, "0")} /MI`;
}

export function feet(metres: number): string {
  return `${Math.round(metres * FEET_PER_METRE)} FT`;
}

/**
 * Format Strava's local start time.
 *
 * `start_date_local` carries a `Z` suffix but is *not* UTC — it's the athlete's
 * wall-clock time with a UTC marker stuck on the end. Formatting it in the UTC
 * zone is what reads that wall clock back correctly; using the phone's local
 * zone would shift every run by the viewer's offset.
 */
export function startedAt(startDateLocal: string): string {
  const date = new Date(startDateLocal);
  if (Number.isNaN(date.getTime())) return "";

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);

  return `${day} at ${time}`;
}

/** Timestamp for the receipt's stamp line. */
export function stampFor(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Ticket number, derived from the activity id.
 *
 * Deterministic on purpose — a random ticket would differ between the preview
 * render and the print render, which is exactly the class of drift this whole
 * design exists to avoid.
 */
export function ticketFor(activityId: number | string): string {
  const digits = String(activityId).replace(/\D/g, "");
  return `#${digits.slice(-4).padStart(4, "0")}`;
}

/** Word for the activity, for the "1 RUN" row. */
function activityNoun(activity: StravaActivity): string {
  const kind = (activity.sport_type ?? activity.type ?? "Run").toLowerCase();
  if (kind.includes("walk")) return "WALK";
  if (kind.includes("hike")) return "HIKE";
  return "RUN";
}

function place(activity: StravaActivity): string | undefined {
  const parts = [activity.location_city, activity.location_state].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export interface BuildReceiptOptions {
  /** Already dithered, in print order. */
  photos?: ReceiptPhoto[];
  /** When the receipt was created. Pass one `Date` and reuse the payload. */
  now?: Date;
  /** Falls back to the activity's own location. */
  subtitle?: string;
}

/** Turn an activity into the payload the renderer takes. */
export function buildReceipt(
  activity: StravaActivity,
  { photos = [], now = new Date(), subtitle }: BuildReceiptOptions = {},
): ReceiptPayload {
  const noun = activityNoun(activity);
  const distance = miles(activity.distance);

  const stats: ReceiptStat[] = [];
  const paceValue = pace(activity.distance, activity.moving_time);
  if (paceValue) stats.push({ label: "PACE", value: paceValue, indent: true });
  stats.push({
    label: "MOVING TIME",
    value: duration(activity.moving_time),
    indent: true,
  });
  if (activity.total_elevation_gain > 0) {
    stats.push({
      label: "ELEVATION GAIN",
      value: feet(activity.total_elevation_gain),
      indent: true,
    });
  }
  if (activity.average_heartrate) {
    stats.push({
      label: "AVG HEART RATE",
      value: `${Math.round(activity.average_heartrate)} BPM`,
      indent: true,
    });
  }

  return {
    title: activity.name,
    subtitle: subtitle ?? place(activity),
    dateLine: startedAt(activity.start_date_local),
    hero: {
      label: "NO. MILES",
      rowLabel: `1 ${noun}`,
      value: distance,
    },
    stats,
    total: {
      label: "TOTAL MILES",
      value: distance,
      note: "(NO ONE LEFT BEHIND)",
    },
    polyline: activity.map?.summary_polyline ?? activity.map?.polyline ?? null,
    photos,
    footerLines: FOOTER_LINES,
    deviceName: activity.device_name ?? null,
    ticket: ticketFor(activity.id),
    stamp: stampFor(now),
  };
}
