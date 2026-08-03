"use client";

import { Reveal } from "./Reveal";

/**
 * The studio credit at the foot of every runner-facing screen.
 *
 * Placed by each page rather than mounted globally in `ClientShell`: every
 * section on this site is `minHeight: 100vh` with a `marginTop: auto` bottom
 * block, so a footer appended after `<main>` would land below the fold on a
 * page that otherwise doesn't scroll. The pages own their own bottom edge.
 *
 * Deliberately not red — the shop's one accent per viewport is already spent
 * on the primary action (connect Strava, print receipt), and a second red would
 * compete with the thing the runner is meant to tap.
 */
export function SiteFooter({ delay = 0 }: { delay?: number }) {
  return (
    <Reveal
      as="p"
      preset="fade"
      delay={delay}
      triggerOnScroll={false}
      style={{
        fontSize: "var(--text-xs)",
        letterSpacing: "0.3em",
        textTransform: "uppercase",
        color: "var(--gray-3)",
      }}
    >
      Built by{" "}
      <a
        href="https://groupdynamics.net"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-opacity hover:opacity-50"
        style={{ color: "var(--black)" }}
      >
        groupdynamics.net
      </a>
    </Reveal>
  );
}
