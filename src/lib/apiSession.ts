/**
 * Session plumbing shared by the Strava API routes.
 *
 * Strava rotates the refresh token on every refresh, so a refreshed session
 * has to be written back to the cookie or the next call fails with a token
 * that no longer exists. Routing every handler through `withSession` makes
 * that impossible to forget.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie, type StravaSession } from "./session";
import { ensureFresh, StravaError } from "./strava";

/** Read the session cookie, or null if absent, tampered with, or expired. */
export function readSession(request: NextRequest): StravaSession | null {
  return sessionCookie.read(request.cookies.get(sessionCookie.name)?.value);
}

/** Write a session back onto a response. */
export function attachSession(
  response: NextResponse,
  session: StravaSession,
): NextResponse {
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.seal(session),
    sessionCookie.options(),
  );
  return response;
}

/** Clear the session — used after a print, once the tokens are handed back. */
export function clearSession(response: NextResponse): NextResponse {
  response.cookies.delete(sessionCookie.name);
  return response;
}

/**
 * Run a handler with a guaranteed-fresh session, persisting any token rotation.
 *
 * Returns 401 when there's no usable session so the client can send the runner
 * back to the connect screen.
 */
export async function withSession(
  request: NextRequest,
  handler: (session: StravaSession) => Promise<NextResponse>,
): Promise<NextResponse> {
  const existing = readSession(request);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not connected" }, { status: 401 });
  }

  let session: StravaSession;
  try {
    session = await ensureFresh(existing);
  } catch (error) {
    console.warn("[strava] refresh failed", error);
    return clearSession(
      NextResponse.json({ ok: false, error: "session expired" }, { status: 401 }),
    );
  }

  let response: NextResponse;
  try {
    response = await handler(session);
  } catch (error) {
    if (error instanceof StravaError) {
      // Surface Strava's own status. 429 in particular needs to read as "wait
      // a minute", not "the app is broken".
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    throw error;
  }

  // Only rewrite the cookie when something actually rotated.
  if (session.accessToken !== existing.accessToken) {
    attachSession(response, session);
  }
  return response;
}
