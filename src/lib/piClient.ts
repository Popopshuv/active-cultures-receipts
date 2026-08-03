/**
 * Talking to the Pi.
 *
 * Every call is server-to-server over the Cloudflare Tunnel. No browser ever
 * reaches the print server directly, which is what lets the shared token stay
 * a server secret instead of shipping in a client bundle.
 */

import { printer } from "./serverEnv";

/** Fail fast rather than leaving a runner watching a spinner. */
const TIMEOUT_MS = 15_000;

export class PrinterOfflineError extends Error {}

function headers(): HeadersInit {
  return { Authorization: `Bearer ${printer.token}` };
}

async function call(
  path: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(`${printer.baseUrl}${path}`, {
      ...init,
      headers: { ...headers(), ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // A tunnel that's down, a Pi that's rebooting, DNS that hasn't caught up:
    // all indistinguishable from here and all mean the same thing to the
    // person holding the phone.
    throw new PrinterOfflineError(
      error instanceof Error ? error.message : "printer unreachable",
    );
  }
}

export interface PrinterHealth {
  ok: boolean;
  head_dots: number;
  threshold: number;
  dry_run: boolean;
  held: boolean;
  queue_depth: number;
}

export async function health(): Promise<PrinterHealth> {
  const response = await call("/health", {}, 5000);
  if (!response.ok) {
    throw new PrinterOfflineError(`printer returned ${response.status}`);
  }
  return (await response.json()) as PrinterHealth;
}

/** Queue a rendered receipt. Returns the Pi's job id. */
export async function submitJob(
  png: ArrayBuffer,
  meta: { ticket: string; label: string },
): Promise<number> {
  const form = new FormData();
  form.append("receipt", new Blob([png], { type: "image/png" }), "receipt.png");
  form.append("meta", JSON.stringify(meta));

  const response = await call("/jobs", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as {
    id?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `printer returned ${response.status}`);
  }
  if (typeof body.id !== "number") {
    throw new Error("printer accepted the job but returned no id");
  }
  return body.id;
}

export interface PrinterJob {
  id: number;
  ticket: string | null;
  label: string | null;
  status: string;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

export async function listJobs(limit = 50): Promise<{
  held: boolean;
  queue_depth: number;
  jobs: PrinterJob[];
}> {
  const response = await call(`/jobs?limit=${limit}`);
  if (!response.ok) {
    throw new PrinterOfflineError(`printer returned ${response.status}`);
  }
  return (await response.json()) as {
    held: boolean;
    queue_depth: number;
    jobs: PrinterJob[];
  };
}

export async function jobAction(
  id: number,
  action: "retry" | "cancel",
): Promise<void> {
  const response = await call(`/jobs/${id}/${action}`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `printer returned ${response.status}`);
  }
}

export async function setHold(held: boolean): Promise<boolean> {
  const response = await call("/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ held }),
  });
  if (!response.ok) throw new PrinterOfflineError("could not change hold");
  const body = (await response.json()) as { held: boolean };
  return body.held;
}

export async function testPrint(): Promise<number> {
  const response = await call("/test", { method: "POST" });
  if (!response.ok) throw new PrinterOfflineError("test print failed");
  const body = (await response.json()) as { id: number };
  return body.id;
}
