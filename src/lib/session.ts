/**
 * Signed cookies, with no database behind them.
 *
 * There are no user accounts here. A runner scans a QR code, authorises
 * Strava, prints one receipt, and leaves. Persisting anything about them would
 * be a liability rather than a feature — so the whole session lives in a
 * signed cookie on their own phone and expires on its own.
 *
 * Signing is HMAC-SHA256 via `node:crypto`. The payload is readable by anyone
 * holding the cookie (it's their own token, on their own device); what the
 * signature buys is that they can't *edit* it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./serverEnv";

/** What we keep for the duration of one visit. */
export interface StravaSession {
  athleteId: number;
  /** First name plus last initial — enough to put on a receipt. */
  name: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. Strava access tokens last six hours. */
  expiresAt: number;
}

interface Envelope<T> {
  data: T;
  /** Unix seconds. Checked on read so an old cookie can't be replayed. */
  exp: number;
}

const SESSION_COOKIE = "ac_session";
const STATE_COOKIE = "ac_oauth_state";
const OPERATOR_COOKIE = "ac_operator";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", sessionSecret()).update(body).digest());
}

/** Serialise and sign a payload with a lifetime in seconds. */
export function seal<T>(data: T, ttlSeconds: number): string {
  const envelope: Envelope<T> = {
    data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64url(JSON.stringify(envelope));
  return `${body}.${sign(body)}`;
}

/**
 * Verify and decode. Returns null for anything suspect — bad signature, bad
 * shape, or expired — so callers only have to handle "signed in or not".
 */
export function unseal<T>(token: string | undefined | null): T | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = fromBase64url(sign(body));
  const actual = fromBase64url(signature);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  try {
    const envelope = JSON.parse(fromBase64url(body).toString("utf8")) as Envelope<T>;
    if (typeof envelope.exp !== "number") return null;
    if (envelope.exp < Math.floor(Date.now() / 1000)) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

/** Cookie options shared by every cookie we set. */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Lax rather than Strict: the OAuth callback is a top-level navigation
    // back from strava.com, and Strict would withhold the state cookie on
    // exactly that request.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Session lifetime, matched to Strava's six-hour access token. */
export const SESSION_TTL = 6 * 60 * 60;

/** CSRF state lifetime — long enough to log in, short enough to not linger. */
export const STATE_TTL = 10 * 60;

export const sessionCookie = {
  name: SESSION_COOKIE,
  options: () => cookieOptions(SESSION_TTL),
  seal: (session: StravaSession) => seal(session, SESSION_TTL),
  read: (raw: string | undefined) => unseal<StravaSession>(raw),
};

export const stateCookie = {
  name: STATE_COOKIE,
  options: () => cookieOptions(STATE_TTL),
  seal: (nonce: string) => seal({ nonce }, STATE_TTL),
  read: (raw: string | undefined) => unseal<{ nonce: string }>(raw),
};

/**
 * Operator sign-in for the control page.
 *
 * Long-lived because it gets used from behind a counter during an event, and
 * nobody wants to retype a passcode with paper jammed in the printer.
 */
export const OPERATOR_TTL = 12 * 60 * 60;

export const operatorCookie = {
  name: OPERATOR_COOKIE,
  options: () => cookieOptions(OPERATOR_TTL),
  seal: () => seal({ operator: true }, OPERATOR_TTL),
  read: (raw: string | undefined) =>
    unseal<{ operator: boolean }>(raw)?.operator === true,
};
