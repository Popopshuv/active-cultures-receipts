/**
 * Server-only configuration.
 *
 * Nothing here is `NEXT_PUBLIC_`, and that is the point. The printer token in
 * particular stays on the server: the runner's phone never talks to the Pi,
 * it talks to us, and we forward. The photobooth shipped its printer token to
 * the browser as `NEXT_PUBLIC_PRINTER_TOKEN`, which meant anyone who loaded
 * the page could drive the printer directly.
 *
 * The usual guard here is the `server-only` package, which turns a client
 * import into a build error. It isn't in the kit and adding a dependency needs
 * sign-off, so this is a runtime guard instead: it fires later than a build
 * error would, but it still fires the first time anyone wires this into a
 * component that ships to the browser.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "serverEnv was imported into client code — it holds the printer token " +
      "and Strava client secret. Move the call to a route handler or server " +
      "component.",
  );
}

import { siteConfig } from "./siteConfig";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}


/** Strava OAuth app credentials, from strava.com/settings/api. */
export const strava = {
  get clientId(): string {
    return required("STRAVA_CLIENT_ID");
  },
  get clientSecret(): string {
    return required("STRAVA_CLIENT_SECRET");
  },
  /**
   * Requested scope.
   *
   * `activity:read` covers everything the receipt needs and reads better on
   * the consent screen than `activity:read_all`, which additionally exposes
   * private activities and privacy-zone data. A narrower scope is also easier
   * to defend when the app goes through Strava's review to lift the athlete
   * cap.
   */
  scope: "activity:read",
} as const;

/** Where the Pi print server lives, and the shared secret for it. */
export const printer = {
  get baseUrl(): string {
    return required("PRINTER_URL").replace(/\/$/, "");
  },
  get token(): string {
    return required("PRINTER_TOKEN");
  },
} as const;

/**
 * Key for signing session and CSRF cookies.
 *
 * Rotating it logs everyone out, which at a run club means "the person
 * mid-flow taps connect again" — not worth engineering around.
 */
export function sessionSecret(): string {
  return required("SESSION_SECRET");
}

/** Shared passcode gating the operator control page. */
export function operatorPasscode(): string {
  return required("OPERATOR_PASSCODE");
}

/**
 * Public origin, used to build the OAuth redirect URI.
 *
 * Must sit inside the Authorization Callback Domain configured on the Strava
 * app or the authorize call is rejected. Strava whitelists `localhost`
 * separately, so development needs no extra setup.
 */
export function siteOrigin(): string {
  // Shares `siteConfig`'s resolution so the OAuth redirect_uri and the
  // metadata base can never disagree about what host we are — and so a
  // scheme-less value pasted from the address bar is repaired in both.
  return siteConfig.url;
}
