/**
 * Operator sign-in.
 *
 * A shared passcode, not accounts. The control page can clear a print queue,
 * so it needs a gate — but the people using it are standing behind the counter
 * at a run club, and anything heavier would just get written on a sticky note.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { operatorCookie } from "@/lib/session";
import { operatorPasscode } from "@/lib/serverEnv";

export const runtime = "nodejs";

function matches(candidate: string): boolean {
  const expected = Buffer.from(operatorPasscode());
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { passcode?: string };

  if (!body.passcode || !matches(body.passcode)) {
    // Deliberately slow: a shared passcode is guessable enough that an
    // unthrottled endpoint is worth avoiding.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ ok: false, error: "wrong passcode" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(operatorCookie.name, operatorCookie.seal(), operatorCookie.options());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(operatorCookie.name);
  return response;
}
