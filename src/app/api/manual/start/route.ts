/**
 * Open a hand-filled receipt.
 *
 * Mints the short-lived cookie that `/api/print` accepts in place of a Strava
 * session. There is nothing to authenticate — anyone who can load the form can
 * get one — so this is a speed bump, not a gate: it means a script has to make
 * a round trip before it can queue paper, and it puts an expiry on the ability
 * to print, which an open endpoint wouldn't have.
 *
 * POST rather than GET so it can't be triggered by a prefetch or an image tag.
 */

import { NextResponse } from "next/server";
import { manualCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(manualCookie.name, manualCookie.seal(), manualCookie.options());
  return response;
}
