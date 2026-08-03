"use client";

import { useSearchParams } from "next/navigation";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { TransitionLink } from "@/components/TransitionLink";

/**
 * What a runner sees after scanning the QR code at the shop.
 *
 * One decision on the screen: connect Strava. Everything else is context, so
 * the only red on the page is the thing you're meant to tap.
 */

/** Failure reasons from `api/strava/callback`, in plain language. */
const ERRORS: Record<string, string> = {
  denied: "You cancelled on Strava. Tap connect to try again.",
  expired: "That took a little too long. Start again.",
  incomplete: "Strava sent us back without an authorisation. Try again.",
  exchange: "Strava wouldn't complete the handshake. Try again in a moment.",
};

export function HomeContent() {
  const error = useSearchParams().get("error");
  const message = error ? (ERRORS[error] ?? ERRORS.exchange) : null;

  return (
    <section
      style={{
        minHeight: "100dvh",
        padding: "var(--page-pad)",
        paddingTop: "6rem",
        // Room under the credit so it isn't flush against the bottom edge —
        // and, on an iPhone, so a scrolled-to-bottom page doesn't leave the
        // last line tucked behind Safari's floating address bar.
        paddingBottom: "clamp(4rem, 10vh, 7rem)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: "30rem" }}>
        <RevealText
          as="p"
          delay={0.2}
          triggerOnScroll={false}
          style={{
            fontSize: "var(--text-xs)",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--gray-3)",
          }}
        >
          Active Cultures — Salt Lake City
        </RevealText>

        <RevealText
          as="h1"
          delay={0.4}
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
          Print your run
        </RevealText>

        <Reveal
          as="p"
          preset="fade-up"
          delay={0.6}
          triggerOnScroll={false}
          style={{
            marginTop: "1.5rem",
            fontSize: "var(--text-reg)",
            lineHeight: 1.7,
            letterSpacing: "0.02em",
            color: "var(--gray-3)",
          }}
        >
          Connect Strava, pick the run you just finished, add up to three
          photos. We&rsquo;ll print it on the receipt printer at the shop.
        </Reveal>

        {message ? (
          <Reveal
            as="p"
            preset="fade"
            delay={0.7}
            triggerOnScroll={false}
            style={{
              marginTop: "1.5rem",
              fontSize: "var(--text-tiny)",
              letterSpacing: "0.02em",
              lineHeight: 1.6,
              color: "var(--gray-3)",
              borderTop: "1px solid var(--gray-1)",
              paddingTop: "1rem",
            }}
          >
            {message}
          </Reveal>
        ) : null}
      </div>

      {/* Sits under the copy rather than pinned to the bottom of the viewport.
          Pinned, it landed behind Safari's floating address bar on an iPhone —
          and there's nothing here that needs to be at the foot of the screen. */}
      <div
        style={{
          paddingTop: "clamp(2.5rem, 8vh, 4.5rem)",
          maxWidth: "30rem",
        }}
      >
        {/* Leaves the app entirely, so a plain anchor rather than
            TransitionLink — there is no client-side route to animate to. */}
        <Reveal preset="fade-up" delay={0.8} triggerOnScroll={false}>
          <a
            href="/api/strava/start"
            className="transition-opacity hover:opacity-50"
            style={{
              display: "inline-block",
              fontSize: "var(--text-sm)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--red)",
              borderBottom: "1px solid var(--red)",
              paddingBottom: "0.35rem",
            }}
          >
            Connect Strava
          </a>
        </Reveal>

        {/* The secondary way in. Grey rather than red: the page gets one red
            moment, and it belongs to the path most runners take. */}
        <Reveal preset="fade" delay={0.9} triggerOnScroll={false}>
          <div style={{ marginTop: "1.75rem" }}>
            <TransitionLink href="/manual">
              <span
                className="transition-opacity hover:opacity-50"
                style={{
                  display: "inline-block",
                  fontSize: "var(--text-sm)",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--gray-3)",
                  borderBottom: "1px solid var(--gray-2)",
                  paddingBottom: "0.35rem",
                }}
              >
                Don&rsquo;t have Strava
              </span>
            </TransitionLink>
          </div>
        </Reveal>

        {/* The shop line and the credit read as a footer rather than as a
            third button, so they get a clear break from the two above. */}
        <Reveal
          as="p"
          preset="fade"
          delay={0.95}
          triggerOnScroll={false}
          style={{
            marginTop: "clamp(3.5rem, 9vh, 5.5rem)",
            fontSize: "var(--text-xs)",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--gray-3)",
          }}
        >
          Active Cultures 2026
        </Reveal>

        <div style={{ marginTop: "0.75rem" }}>
          <SiteFooter delay={1.05} />
        </div>
      </div>
    </section>
  );
}
