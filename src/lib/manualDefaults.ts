/**
 * Everything the no-Strava receipt falls back to, in one object.
 *
 * ## Why this file exists
 *
 * A runner filling the form by hand is standing in a shop, on their phone,
 * having just finished running. Most of them will fill in one field and tap
 * print. So the defaults are not edge-case handling — they are what the
 * receipt usually says, and they should read like something a person wrote.
 *
 * Every value below is safe to change without touching the form or the
 * renderer. `manualReceipt.ts` reads them and nothing else does.
 */

/**
 * Distance used when the runner leaves it blank.
 *
 * A string, not a number, because it prints verbatim — "3.10" and "3.1" are
 * different receipts, and the two-decimal form is what the Strava path emits.
 */
export const DEFAULT_MILES = "3.10";

/**
 * Duration used when the runner leaves it blank.
 *
 * Read by the same parser as typed input, so `h:mm:ss`, `mm:ss` and a bare
 * number of minutes all work here too.
 */
export const DEFAULT_DURATION = "30:00";

/**
 * Where the run happened. Prints under the title.
 *
 * Defaults to the shop rather than to nothing, on the grounds that a run
 * starting from a QR code in the shop probably started at the shop.
 */
export const DEFAULT_SUBTITLE = "Salt Lake City, Utah";

/**
 * Names by time of day, matching how Strava titles an untitled activity — so a
 * hand-filled receipt and a Strava one read the same.
 *
 * Scanned in order; the first entry whose `until` hour is greater than the
 * current hour wins. Keep it sorted and keep the last entry at 24, which is
 * the catch-all.
 */
export const TITLES_BY_HOUR: readonly { until: number; title: string }[] = [
  { until: 5, title: "Night Run" },
  { until: 11, title: "Morning Run" },
  { until: 14, title: "Lunch Run" },
  { until: 17, title: "Afternoon Run" },
  { until: 21, title: "Evening Run" },
  { until: 24, title: "Night Run" },
];

/**
 * Column and row headings on the printed receipt.
 *
 * These mirror `buildReceipt` in `runFormat.ts`. Changing one without the other
 * gives you two receipts that don't look like they came from the same shop.
 */
export const LABELS = {
  hero: "NO. MILES",
  /** The `1 RUN` line. The noun is separate so it can become WALK or RIDE. */
  noun: "RUN",
  total: "TOTAL MILES",
  pace: "PACE",
  movingTime: "MOVING TIME",
} as const;

/** Pick the default title for a given moment. */
export function titleFor(now: Date): string {
  const hour = now.getHours();
  const match = TITLES_BY_HOUR.find((entry) => hour < entry.until);
  return match?.title ?? TITLES_BY_HOUR[TITLES_BY_HOUR.length - 1].title;
}
