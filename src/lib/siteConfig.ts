/**
 * Single source of truth for everything that shows up in a browser tab, a
 * search result, or a shared-link preview (iMessage, Slack, Twitter, etc.).
 *
 * Starting a new project? Edit the four fields below and you're done — the
 * root metadata in `app/layout.tsx` and the share card in
 * `app/opengraph-image.tsx` both read from here.
 */
export const siteConfig = {
  /** Brand / app name. Used as the OG site name and the title-template suffix. */
  name: "Active Cultures",
  /** Default page title (the home page + tab title). */
  title: "Active Cultures — Print your run",
  /** One-line description for search results and link previews. */
  description:
    "Scan, connect Strava, pick your run. We print it on the receipt printer at the shop.",
  /**
   * Canonical production URL. Required so link-preview images resolve to
   * absolute URLs (relative og:image URLs don't render on iPhone / Slack).
   *
   * Resolution order:
   *  1. NEXT_PUBLIC_SITE_URL — set this in Vercel for your real domain.
   *  2. VERCEL_PROJECT_PRODUCTION_URL — auto-set by Vercel on deploy.
   *  3. localhost — dev fallback.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
} as const;
