/**
 * Kick off the Strava OAuth handshake.
 *
 * The QR code points at `/`, and the connect button lands here. We mint a
 * nonce, send it to Strava as `state`, and stash a signed copy in a cookie —
 * the callback only proceeds if the two agree, which is what stops someone
 * from feeding a runner's browser an authorisation code that isn't theirs.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { stateCookie } from "@/lib/session";
import { authorizeUrl } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET() {
  const nonce = randomUUID();

  const response = NextResponse.redirect(authorizeUrl(nonce));
  response.cookies.set(stateCookie.name, stateCookie.seal(nonce), stateCookie.options());
  return response;
}
