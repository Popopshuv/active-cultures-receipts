/**
 * Gate for the operator-only endpoints.
 */

import { NextResponse, type NextRequest } from "next/server";
import { operatorCookie } from "./session";

/** Returns a 401 response when the caller isn't a signed-in operator. */
export function requireOperator(request: NextRequest): NextResponse | null {
  const signedIn = operatorCookie.read(
    request.cookies.get(operatorCookie.name)?.value,
  );
  if (!signedIn) {
    return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  }
  return null;
}
