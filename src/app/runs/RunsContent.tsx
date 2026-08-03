"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";
import { TransitionLink } from "@/components/TransitionLink";
import { SiteFooter } from "@/components/SiteFooter";
import { polylineToDataUri } from "@/lib/polyline";

interface RunSummary {
  id: number;
  name: string;
  miles: string;
  duration: string;
  startedAt: string;
  polyline: string | null;
  photoCount: number;
}

/** Route thumbnails in the list, so runs are recognisable at a glance. */
const THUMB = { width: 72, height: 44, stroke: 1.5, padding: 3 };

export function RunsContent() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/strava/activities");
        if (response.status === 401) {
          // Session gone or already handed back after a print.
          router.replace("/");
          return;
        }
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.ok) {
          setError(body.error ?? "Couldn't reach Strava.");
          return;
        }
        setRuns(body.activities as RunSummary[]);
      } catch {
        if (!cancelled) setError("Couldn't reach Strava.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <section
      style={{
        minHeight: "100dvh",
        padding: "var(--page-pad)",
        paddingTop: "6rem",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <RevealText
        as="p"
        delay={0.15}
        triggerOnScroll={false}
        style={{
          fontSize: "var(--text-xs)",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--gray-3)",
        }}
      >
        Step one of two
      </RevealText>

      <RevealText
        as="h1"
        delay={0.3}
        triggerOnScroll={false}
        stagger={0.015}
        style={{
          marginTop: "1.5rem",
          fontSize: "var(--text-reg)",
          lineHeight: 1.3,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        Pick your run
      </RevealText>

      <div style={{ marginTop: "clamp(2rem, 6vh, 4rem)", maxWidth: "34rem", width: "100%" }}>
        {error ? (
          <Reveal
            as="p"
            preset="fade"
            triggerOnScroll={false}
            style={{
              fontSize: "var(--text-tiny)",
              letterSpacing: "0.02em",
              color: "var(--gray-3)",
              lineHeight: 1.6,
            }}
          >
            {error}
          </Reveal>
        ) : null}

        {!error && runs === null ? (
          <Reveal
            as="p"
            preset="fade"
            triggerOnScroll={false}
            style={{
              fontSize: "var(--text-tiny)",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--gray-3)",
            }}
          >
            Loading
          </Reveal>
        ) : null}

        {runs?.length === 0 ? (
          <Reveal
            as="p"
            preset="fade"
            triggerOnScroll={false}
            style={{
              fontSize: "var(--text-tiny)",
              letterSpacing: "0.02em",
              color: "var(--gray-3)",
              lineHeight: 1.6,
            }}
          >
            No runs on your Strava yet. Finish one, upload it, then come back.
          </Reveal>
        ) : null}

        {runs?.map((run, i) => {
          const thumb = polylineToDataUri(run.polyline, THUMB);
          return (
            <Reveal key={run.id} preset="fade-up" delay={i * 0.05} triggerOnScroll={false}>
              <TransitionLink href={`/runs/${run.id}`}>
                <div
                  className="transition-opacity hover:opacity-50"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1.5rem",
                    padding: "1.1rem 0",
                    borderTop: "1px solid var(--gray-1)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                      }}
                    >
                      {run.name}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "var(--gray-3)",
                      }}
                    >
                      {run.miles} mi — {run.duration} — {run.startedAt}
                    </span>
                  </div>

                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      width={THUMB.width}
                      height={THUMB.height}
                      alt=""
                      style={{ flexShrink: 0 }}
                    />
                  ) : null}
                </div>
              </TransitionLink>
            </Reveal>
          );
        })}
      </div>

      <div style={{ marginTop: "auto", paddingTop: "clamp(3rem, 10vh, 6rem)" }}>
        <SiteFooter delay={0.6} />
      </div>
    </section>
  );
}
