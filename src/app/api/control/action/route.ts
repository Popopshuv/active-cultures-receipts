/**
 * Operator actions against the print queue.
 *
 * One endpoint rather than five routes — every action is a short command with
 * the same auth and the same failure mode.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/operatorGuard";
import { PrinterOfflineError, jobAction, setHold, testPrint } from "@/lib/piClient";

export const runtime = "nodejs";

type Action = "retry" | "cancel" | "hold" | "release" | "test";

const ACTIONS: readonly Action[] = ["retry", "cancel", "hold", "release", "test"];

export async function POST(request: NextRequest) {
  const denied = requireOperator(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    action?: Action;
    id?: number;
  };

  if (!body.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "retry":
      case "cancel": {
        if (typeof body.id !== "number") {
          return NextResponse.json(
            { ok: false, error: "missing job id" },
            { status: 400 },
          );
        }
        await jobAction(body.id, body.action);
        return NextResponse.json({ ok: true });
      }
      case "hold":
      case "release": {
        const held = await setHold(body.action === "hold");
        return NextResponse.json({ ok: true, held });
      }
      case "test": {
        const id = await testPrint();
        return NextResponse.json({ ok: true, id });
      }
    }
  } catch (error) {
    if (error instanceof PrinterOfflineError) {
      return NextResponse.json(
        { ok: false, error: "printer offline" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed" },
      { status: 502 },
    );
  }
}
