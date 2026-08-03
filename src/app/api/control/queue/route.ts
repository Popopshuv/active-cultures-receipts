/**
 * Queue state for the control page.
 *
 * A printer that's unreachable is normal operational information here, not an
 * error — the whole point of this page is to tell you the Pi is down.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/operatorGuard";
import { PrinterOfflineError, listJobs } from "@/lib/piClient";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = requireOperator(request);
  if (denied) return denied;

  try {
    const queue = await listJobs();
    return NextResponse.json({ ok: true, online: true, ...queue });
  } catch (error) {
    if (error instanceof PrinterOfflineError) {
      return NextResponse.json({
        ok: true,
        online: false,
        reason: error.message,
        held: false,
        queue_depth: 0,
        jobs: [],
      });
    }
    throw error;
  }
}
