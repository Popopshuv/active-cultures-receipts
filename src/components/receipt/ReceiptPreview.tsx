"use client";

import { Reveal } from "@/components/Reveal";

/**
 * The receipt as it will print.
 *
 * Rendered at 384 dots and shown unscaled where there's room, with pixelated
 * scaling so the runner sees real dots rather than a browser's idea of a smooth
 * photo.
 */
export function ReceiptPreview({
  url,
  rendering,
  action,
}: {
  url: string;
  rendering: boolean;
  /** The print button, repeated above the preview so it isn't missed. */
  action?: React.ReactNode;
}) {
  return (
    <Reveal preset="fade" delay={0.2} triggerOnScroll={false}>
      {/* Repeated above the preview so the action is reachable without
          scrolling past a receipt's worth of paper to find it. */}
      {action ? <div style={{ marginBottom: "1.75rem" }}>{action}</div> : null}

      <p
        style={{
          fontSize: "var(--text-xs)",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--gray-3)",
          marginBottom: "0.75rem",
        }}
      >
        {rendering ? "Updating" : "Exactly what prints"}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Receipt preview"
        style={{
          width: 384,
          maxWidth: "100%",
          height: "auto",
          imageRendering: "pixelated",
          border: "1px solid var(--gray-1)",
          opacity: rendering ? 0.5 : 1,
          transition: "opacity 0.3s",
        }}
      />
    </Reveal>
  );
}
