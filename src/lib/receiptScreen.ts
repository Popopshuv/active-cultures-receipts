/**
 * Shared furniture for the two screens that end in a printed receipt.
 *
 * Kept together so the Strava flow and the hand-filled flow can't drift into
 * looking like two different products.
 */

export const LABEL_STYLE = {
  fontSize: "var(--text-xs)",
  letterSpacing: "0.3em",
  textTransform: "uppercase" as const,
  color: "var(--gray-3)",
};

/**
 * The primary action.
 *
 * This is each page's one red moment. It appears twice — once above the preview
 * and once below it — but the preview is a full receipt at print width, over a
 * thousand pixels tall, so the two are never on screen together.
 */
export const PRINT_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  paddingBottom: "0.35rem",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
  color: "var(--red)",
  borderBottom: "1px solid var(--red)",
};

/**
 * How long the confirmation holds before the screen returns home.
 *
 * The credential is already spent by the time this starts — `/api/print`
 * deauthorises Strava, or drops the manual cookie, before it responds — so this
 * is only about giving the runner time to read the confirmation before the
 * screen resets for whoever scans the QR code next.
 */
export const PRINTED_RESET_MS = 6000;
