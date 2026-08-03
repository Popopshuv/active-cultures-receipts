/**
 * Where Strava sends the runner back.
 *
 * Verifies the CSRF state, trades the code for tokens, and drops a signed
 * session cookie. Errors redirect home with a readable reason rather than
 * rendering a stack trace at someone standing in a shop.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie, stateCookie } from "@/lib/session";
import { exchangeCode } from "@/lib/strava";
import { siteOrigin } from "@/lib/serverEnv";

export const runtime = "nodejs";

function fail(reason: string): NextResponse {
  const url = new URL("/", siteOrigin());
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(stateCookie.name);
  return response;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;

  // The runner tapped "Cancel" on Strava's consent screen.
  if (params.get("error")) return fail("denied");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("incomplete");

  const expected = stateCookie.read(request.cookies.get(stateCookie.name)?.value);
  if (!expected || expected.nonce !== state) {
    // Either a forged callback, or a state cookie that aged out because the
    // consent screen sat open too long. Same remedy: start again.
    return fail("expired");
  }

  let session;
  try {
    session = await exchangeCode(code);
  } catch (error) {
    console.error("[strava] code exchange failed", error);
    return fail("exchange");
  }

  const response = NextResponse.redirect(new URL("/runs", siteOrigin()));
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.seal(session),
    sessionCookie.options(),
  );
  response.cookies.delete(stateCookie.name);
  return response;
}
