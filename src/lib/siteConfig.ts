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
  url: resolveSiteUrl(),
} as const;

/**
 * Work out the canonical origin.
 *
 * Written defensively because the failure is a build error with no useful
 * message. `layout.tsx` feeds this straight into `new URL()` for
 * `metadataBase`, so anything malformed fails the whole deploy with
 * `TypeError: Invalid URL` and a redacted input.
 *
 * Two ways that happens in practice, both survivable now:
 *
 * - **An env var set to an empty string.** `??` only catches null/undefined,
 *   so a variable that exists in the Vercel dashboard with a blank value used
 *   to pass `""` through untouched.
 * - **A host with no scheme.** `active-cultures-receipts.vercel.app` is what
 *   you naturally paste from the address bar, and it isn't a URL.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return withScheme(explicit);

  // Vercel sets this to the production host on every deploy, previews
  // included — which is what we want, since that's the host registered as
  // Strava's callback domain.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return withScheme(vercel);

  return "http://localhost:3000";
}

function withScheme(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}
