/**
 * Strava API client.
 *
 * Only the handful of calls a receipt needs: authorise, exchange, list runs,
 * fetch one run with its photos, and — importantly — hand the authorisation
 * back afterwards.
 *
 * ## Why we deauthorise
 *
 * Since June 2026 a Strava app is capped on connected athletes: one by
 * default, ten after self-upgrading with a paid subscription, more only after
 * app review. A run club has more than ten runners.
 *
 * This app needs an athlete's data for about thirty seconds — read one
 * activity, render a bitmap, queue it — and never again. So it gives the
 * authorisation straight back once the job is safely queued. If Strava's
 * counter tracks live connections rather than lifetime authorisations, that
 * keeps the app at one or two connections no matter how many people run
 * through it. Strava doesn't document which it is; see the README for the
 * five-minute test that settles it.
 *
 * Either way it's the right behaviour: holding tokens for people who wanted a
 * receipt would be keeping data we have no use for.
 */

import { strava as stravaConfig, siteOrigin } from "./serverEnv";
import type { StravaSession } from "./session";

const API = "https://www.strava.com/api/v3";
const OAUTH = "https://www.strava.com/oauth";

/** Subset of Strava's SummaryActivity that the receipt actually uses. */
export interface StravaActivity {
  id: number;
  name: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  moving_time: number;
  elapsed_time: number;
  /** Metres. */
  total_elevation_gain: number;
  type: string;
  sport_type?: string;
  /** Local wall-clock time of the start, ISO-ish, without a real offset. */
  start_date_local: string;
  location_city?: string | null;
  location_state?: string | null;
  /** Metres per second. */
  average_speed?: number;
  average_heartrate?: number;
  device_name?: string | null;
  map?: {
    summary_polyline?: string | null;
    polyline?: string | null;
  };
  total_photo_count?: number;
}

/** A photo attached to an activity. `urls` is keyed by requested size. */
export interface StravaPhoto {
  unique_id?: string;
  urls?: Record<string, string>;
  source?: number;
}

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The OAuth redirect target. Must sit inside the app's callback domain. */
export function redirectUri(): string {
  return `${siteOrigin()}/api/strava/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: stravaConfig.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: stravaConfig.scope,
    // `auto` lets a returning athlete through without re-tapping approve.
    approval_prompt: "auto",
    state,
  });
  return `${OAUTH}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      ...body,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StravaError(
      `token request failed: ${response.status} ${detail.slice(0, 200)}`,
      response.status,
    );
  }
  return (await response.json()) as TokenResponse;
}

/** Trade an authorisation code for tokens, and build the session. */
export async function exchangeCode(code: string): Promise<StravaSession> {
  const token = await tokenRequest({ code, grant_type: "authorization_code" });
  const first = token.athlete?.firstname?.trim() ?? "";
  const last = token.athlete?.lastname?.trim() ?? "";

  return {
    athleteId: token.athlete?.id ?? 0,
    // First name plus last initial. Enough to personalise a receipt without
    // printing someone's full name on a slip of paper in a shop.
    name: [first, last ? `${last.charAt(0)}.` : ""].filter(Boolean).join(" "),
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  };
}

/**
 * Refresh if the access token is close to expiring.
 *
 * Strava rotates the refresh token on every refresh, so the new one has to be
 * written back to the session — returning the whole session rather than just a
 * token keeps that impossible to forget.
 */
export async function ensureFresh(session: StravaSession): Promise<StravaSession> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - now > 300) return session;

  const token = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });

  return {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  };
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 429) {
    // 200 requests per 15 minutes, 2000 per day on the standard tier. Worth
    // naming explicitly — at an event this reads as "the app is broken".
    throw new StravaError("strava rate limit reached", 429);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StravaError(
      `strava ${response.status}: ${detail.slice(0, 200)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/** Sports we offer on the picker. It's a run club, but people walk it too. */
const RUNNISH = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

/** Recent activities, most recent first, filtered to things you did on foot. */
export async function listActivities(
  accessToken: string,
  perPage = 30,
): Promise<StravaActivity[]> {
  const activities = await apiGet<StravaActivity[]>(
    `/athlete/activities?per_page=${perPage}`,
    accessToken,
  );
  return activities.filter((a) => RUNNISH.has(a.sport_type ?? a.type));
}

export async function getActivity(
  accessToken: string,
  id: number | string,
): Promise<StravaActivity> {
  return apiGet<StravaActivity>(`/activities/${id}`, accessToken);
}

/**
 * Photos attached to an activity.
 *
 * `photo_sources=true` is not optional — without it the response contains only
 * Instagram-sourced photos. `size` asks for the smallest image at least that
 * large on one side; we only ever print 368px wide, so 800 is generous and
 * keeps the download small on a phone connection.
 *
 * This endpoint is thinly documented and could change. A failure here should
 * cost the runner their photo options, not their receipt, so callers treat it
 * as best-effort.
 */
export async function getActivityPhotos(
  accessToken: string,
  id: number | string,
  size = 800,
): Promise<StravaPhoto[]> {
  try {
    return await apiGet<StravaPhoto[]>(
      `/activities/${id}/photos?photo_sources=true&size=${size}`,
      accessToken,
    );
  } catch (error) {
    console.warn("[strava] photo fetch failed:", error);
    return [];
  }
}

/** Pick the largest URL offered for a photo. */
export function bestPhotoUrl(photo: StravaPhoto): string | null {
  const urls = Object.entries(photo.urls ?? {});
  if (urls.length === 0) return null;
  const best = urls.sort(
    ([a], [b]) => Number.parseInt(b, 10) - Number.parseInt(a, 10),
  )[0];
  return best?.[1] ?? null;
}

/**
 * Hand the authorisation back.
 *
 * Best-effort by design: this runs after the receipt is already queued, and a
 * failure here must never turn a successful print into an error for someone
 * standing at the printer. A missed revocation costs one slot against the
 * athlete cap, which the operator page surfaces.
 */
export async function deauthorize(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${OAUTH}/deauthorize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[strava] deauthorize returned ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[strava] deauthorize failed:", error);
    return false;
  }
}
