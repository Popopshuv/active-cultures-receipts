"use client";

import { useCallback, useEffect, useState } from "react";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";

/**
 * The page you open when something has gone wrong.
 *
 * Everything here is for the person behind the counter mid-event: is the Pi
 * alive, what's stuck, print a test strip, stop everything. It polls rather
 * than pushes — a few seconds of staleness is fine, and a socket is one more
 * thing to fail in a shop with patchy wifi.
 */

interface Job {
  id: number;
  ticket: string | null;
  label: string | null;
  status: string;
  error: string | null;
  attempts: number;
  updated_at: number;
}

interface Queue {
  online: boolean;
  reason?: string;
  held: boolean;
  queue_depth: number;
  jobs: Job[];
}

const POLL_MS = 4000;

const LABEL_STYLE = {
  fontSize: "var(--text-xs)",
  letterSpacing: "0.3em",
  textTransform: "uppercase" as const,
  color: "var(--gray-3)",
};

const ACTION_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
  color: "var(--black)",
};

/** Outcome of one poll, so the fetch itself never touches React state. */
type QueueResult =
  | { kind: "ok"; queue: Queue }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

async function loadQueue(): Promise<QueueResult> {
  try {
    const response = await fetch("/api/control/queue");
    if (response.status === 401) return { kind: "unauthorized" };
    return { kind: "ok", queue: (await response.json()) as Queue };
  } catch {
    return { kind: "error", message: "Couldn't reach the site." };
  }
}

function timeAgo(seconds: number): string {
  const delta = Math.max(0, Date.now() / 1000 - seconds);
  if (delta < 60) return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  return `${Math.round(delta / 3600)}h ago`;
}

export function ControlContent() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Fetching is kept free of setState so it can be called from an effect
  // without triggering cascading renders — the effects below apply the result
  // in a promise callback instead.
  const applyQueue = useCallback((result: QueueResult) => {
    if (result.kind === "unauthorized") {
      setSignedIn(false);
      return;
    }
    if (result.kind === "error") {
      setMessage(result.message);
      return;
    }
    setSignedIn(true);
    setQueue(result.queue);
  }, []);

  const refresh = useCallback(
    () => loadQueue().then(applyQueue),
    [applyQueue],
  );

  // First load doubles as the "am I signed in" probe.
  useEffect(() => {
    let cancelled = false;
    loadQueue().then((result) => {
      if (!cancelled) applyQueue(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyQueue]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const timer = setInterval(() => {
      loadQueue().then((result) => {
        if (!cancelled) applyQueue(result);
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [signedIn, applyQueue]);

  const signIn = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setMessage(null);
      const response = await fetch("/api/control/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        setMessage("Wrong passcode.");
        return;
      }
      setPasscode("");
      await refresh();
    },
    [passcode, refresh],
  );

  const act = useCallback(
    async (action: string, id?: number) => {
      setMessage(null);
      const response = await fetch("/api/control/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setMessage(body.error ?? "That didn't work.");
      await refresh();
    },
    [refresh],
  );

  if (signedIn === false) {
    return (
      <section
        style={{
          minHeight: "100vh",
          padding: "var(--page-pad)",
          paddingTop: "6rem",
        }}
      >
        <RevealText
          as="h1"
          triggerOnScroll={false}
          delay={0.2}
          style={{
            fontSize: "var(--text-reg)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Control
        </RevealText>

        <Reveal preset="fade-up" delay={0.4} triggerOnScroll={false}>
          <form onSubmit={signIn} style={{ marginTop: "2rem", maxWidth: "18rem" }}>
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Passcode"
              autoComplete="current-password"
              style={{
                width: "100%",
                background: "none",
                border: "none",
                borderBottom: "1px solid var(--gray-2)",
                padding: "0.5rem 0",
                fontFamily: "var(--font-abc)",
                fontSize: "var(--text-reg)",
                letterSpacing: "0.15em",
                color: "var(--black)",
                outline: "none",
              }}
            />
            <button
              type="submit"
              className="transition-opacity hover:opacity-50"
              style={{
                ...ACTION_STYLE,
                marginTop: "1.5rem",
                color: "var(--red)",
                borderBottom: "1px solid var(--red)",
                paddingBottom: "0.3rem",
              }}
            >
              Sign in
            </button>
          </form>
        </Reveal>

        {message ? (
          <p
            style={{
              marginTop: "1.5rem",
              fontSize: "var(--text-tiny)",
              color: "var(--gray-3)",
            }}
          >
            {message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      style={{
        minHeight: "100vh",
        padding: "var(--page-pad)",
        paddingTop: "6rem",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <div>
        <RevealText as="p" triggerOnScroll={false} delay={0.1} style={LABEL_STYLE}>
          Active Cultures — Printer
        </RevealText>
        <RevealText
          as="h1"
          triggerOnScroll={false}
          delay={0.25}
          style={{
            marginTop: "1.25rem",
            fontSize: "var(--text-reg)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Control
        </RevealText>
      </div>

      {/* Status. The offline case is the reason this page exists, so it gets
          the page's one red moment. */}
      <div
        style={{
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
          borderTop: "1px solid var(--gray-1)",
          paddingTop: "1rem",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: queue?.online ? "var(--black)" : "var(--red)",
          }}
        >
          {queue === null ? "Checking" : queue.online ? "Printer online" : "Printer offline"}
        </span>
        <span style={{ ...LABEL_STYLE, letterSpacing: "0.15em" }}>
          {queue?.queue_depth ?? 0} waiting
        </span>
        {queue?.held ? (
          <span
            style={{
              fontSize: "var(--text-sm)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            Held
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => act(queue?.held ? "release" : "hold")}
          className="transition-opacity hover:opacity-50"
          style={ACTION_STYLE}
        >
          {queue?.held ? "Release queue" : "Hold queue"}
        </button>
        <button
          type="button"
          onClick={() => act("test")}
          className="transition-opacity hover:opacity-50"
          style={ACTION_STYLE}
        >
          Test print
        </button>
        <button
          type="button"
          onClick={refresh}
          className="transition-opacity hover:opacity-50"
          style={{ ...ACTION_STYLE, color: "var(--gray-3)" }}
        >
          Refresh
        </button>
      </div>

      {message ? (
        <p style={{ fontSize: "var(--text-tiny)", color: "var(--gray-3)" }}>{message}</p>
      ) : null}

      <div>
        <p style={{ ...LABEL_STYLE, marginBottom: "0.5rem" }}>Recent jobs</p>
        {(queue?.jobs ?? []).length === 0 ? (
          <p style={{ fontSize: "var(--text-tiny)", color: "var(--gray-3)" }}>
            Nothing yet.
          </p>
        ) : null}

        {(queue?.jobs ?? []).map((job) => (
          <div
            key={job.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1.5rem",
              padding: "0.9rem 0",
              borderTop: "1px solid var(--gray-1)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                }}
              >
                {job.ticket || `#${job.id}`} — {job.label || "receipt"}
              </span>
              <span style={{ ...LABEL_STYLE, letterSpacing: "0.15em" }}>
                {job.status}
                {job.attempts > 1 ? ` — ${job.attempts} tries` : ""} —{" "}
                {timeAgo(job.updated_at)}
                {job.error ? ` — ${job.error}` : ""}
              </span>
            </div>

            <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
              {job.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => act("retry", job.id)}
                  className="transition-opacity hover:opacity-50"
                  style={{ ...ACTION_STYLE, fontSize: "var(--text-xs)" }}
                >
                  Retry
                </button>
              ) : null}
              {job.status === "queued" || job.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => act("cancel", job.id)}
                  className="transition-opacity hover:opacity-50"
                  style={{
                    ...ACTION_STYLE,
                    fontSize: "var(--text-xs)",
                    color: "var(--gray-3)",
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
