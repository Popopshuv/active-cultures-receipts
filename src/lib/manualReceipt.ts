/**
 * Hand-entered run → receipt payload.
 *
 * The counterpart to `buildReceipt` in `runFormat.ts`, for runners who don't
 * use Strava. Same output type, same renderer, same printer — the only
 * difference is where the numbers come from, and that there's no GPS track to
 * draw, so the route signature section is omitted rather than left empty.
 *
 * Pure and isomorphic, for the same reason `runFormat` is: the payload is built
 * once on the phone and posted twice, to preview and to print. Anything that
 * read the clock in here would make those two renders differ.
 */

import {
  DEFAULT_DURATION,
  DEFAULT_MILES,
  DEFAULT_SUBTITLE,
  LABELS,
  titleFor,
} from "./manualDefaults";
import { FOOTER_LINES } from "./receiptConfig";
import { duration as formatDuration, pace, stampFor } from "./runFormat";
import type { ReceiptPayload, ReceiptPhoto, ReceiptStat } from "./receiptPayload";

const METRES_PER_MILE = 1609.344;

/** What the form collects. Every field may be blank — that's the point. */
export interface ManualRun {
  /** Activity name. Blank falls back to the time of day. */
  title: string;
  /** Distance in miles, as typed. */
  miles: string;
  /** `h:mm:ss`, `mm:ss`, or a bare number of minutes. */
  duration: string;
  /** `YYYY-MM-DDTHH:mm` from a datetime-local input. Blank means now. */
  startedAt: string;
}

/** An empty form. Exported so the page and the defaults can't disagree. */
export const EMPTY_RUN: ManualRun = {
  title: "",
  miles: "",
  duration: "",
  startedAt: "",
};

/**
 * Read a typed distance.
 *
 * Tolerant on purpose — someone types "3.1 miles" or "3,1" as often as "3.1",
 * and rejecting that on a phone keyboard mid-shop is worse than guessing.
 * Returns null when there's no number in there at all.
 */
export function parseMiles(input: string): number | null {
  const match = input.replace(",", ".").match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Read a typed duration into seconds.
 *
 * Accepts `h:mm:ss`, `mm:ss`, and a bare number, which is read as minutes —
 * someone entering "30" means half an hour, not half a minute. Returns null if
 * there are no digits to work with.
 */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.some((part) => part.trim() !== "" && !/^\d+$/.test(part.trim()))) {
    return null;
  }

  const numbers = parts.map((part) => Number(part.trim() || 0));
  if (numbers.some((n) => !Number.isFinite(n))) return null;

  let seconds: number;
  if (numbers.length === 1) seconds = numbers[0] * 60;
  else if (numbers.length === 2) seconds = numbers[0] * 60 + numbers[1];
  else if (numbers.length === 3) {
    seconds = numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  } else return null;

  return seconds > 0 ? seconds : null;
}

/**
 * Long-form date line, e.g. `SUNDAY, AUGUST 3, 2026 AT 7:04 PM`.
 *
 * Unlike the Strava path this reads the phone's own zone, which is correct
 * here: the runner is typing a local wall-clock time into a local device.
 */
function dateLineFor(date: Date): string {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} at ${time}`;
}

/**
 * When the run happened.
 *
 * A `datetime-local` value has no zone, so `new Date()` reads it in the
 * phone's — which is what the runner meant. Anything unparseable falls back to
 * `now` rather than printing an Invalid Date.
 */
function startedAtFor(input: string, now: Date): Date {
  if (!input) return now;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

export interface BuildManualOptions {
  /** Already dithered, in print order. */
  photos?: ReceiptPhoto[];
  /** When the receipt was created. Pass one `Date` and reuse the payload. */
  now?: Date;
  /**
   * Ticket number, e.g. `#0042`.
   *
   * Supplied by the caller rather than generated here, because it has to be
   * identical across the preview render and the print render — the same reason
   * `stamp` is a parameter and not a clock read.
   */
  ticket: string;
}

/** Turn a hand-filled form into the payload the renderer takes. */
export function buildManualReceipt(
  run: ManualRun,
  { photos = [], now = new Date(), ticket }: BuildManualOptions,
): ReceiptPayload {
  const started = startedAtFor(run.startedAt, now);

  // A blank field means "use the default", and the defaults go through exactly
  // the same parsing as typed input — so a bad default shows up as a wrong
  // receipt, not as a crash.
  const milesValue = parseMiles(run.miles) ?? parseMiles(DEFAULT_MILES) ?? 0;
  const seconds =
    parseDuration(run.duration) ?? parseDuration(DEFAULT_DURATION) ?? 0;

  const distance = milesValue.toFixed(2);
  const metres = milesValue * METRES_PER_MILE;

  const stats: ReceiptStat[] = [];
  const paceValue = pace(metres, seconds);
  if (paceValue) stats.push({ label: LABELS.pace, value: paceValue, indent: true });
  stats.push({
    label: LABELS.movingTime,
    value: formatDuration(seconds),
    indent: true,
  });

  return {
    title: run.title.trim() || titleFor(started),
    subtitle: DEFAULT_SUBTITLE,
    dateLine: dateLineFor(started),
    hero: {
      label: LABELS.hero,
      rowLabel: `1 ${LABELS.noun}`,
      value: distance,
    },
    stats,
    total: { label: LABELS.total, value: distance },
    // No GPS, so no route signature. Null drops the section entirely rather
    // than printing an empty box where the track would be.
    polyline: null,
    photos,
    footerLines: FOOTER_LINES,
    deviceName: null,
    ticket,
    stamp: stampFor(now),
  };
}
