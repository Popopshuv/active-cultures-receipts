"use client";

import { useRef } from "react";
import { useReveal, REVEAL_HIDDEN_STYLE, type RevealPreset } from "@/lib/useReveal";

interface RevealProps {
  children?: React.ReactNode;
  /** Element to render. Default `div`. */
  as?:
    | "div"
    | "section"
    | "article"
    | "header"
    | "footer"
    | "figure"
    | "ul"
    | "ol"
    | "li"
    | "p"
    | "span";
  /** Which reveal preset to use. Default `fade-up`. */
  preset?: RevealPreset;
  className?: string;
  style?: React.CSSProperties;
  /** Delay before the tween starts. */
  delay?: number;
  /** Duration override; each preset has a tasteful default. */
  duration?: number;
  /** ScrollTrigger position. Default `"top 85%"`. */
  start?: string;
  /** Set `false` to fire on mount instead of on scroll. Default `true`. */
  triggerOnScroll?: boolean;
}

/**
 * Block-level reveal for content that shouldn't get the per-word
 * `<RevealText>` treatment — body copy, lists, cards, images, groups.
 *
 * Fades the whole element in on scroll using a `useReveal` preset, so you wrap
 * one container instead of every line. Honours `prefers-reduced-motion` and
 * gates on the page transition automatically (via `useReveal`).
 *
 * The hidden start state is rendered inline (and tagged `data-reveal`) so
 * above-the-fold content never flashes visible before animating. Reduced-motion
 * and no-JS fallbacks (see `globals.css` + `layout.tsx`) force it visible so
 * content is never stuck hidden.
 *
 * @example
 * <Reveal>
 *   <p>A paragraph that lifts in as one block.</p>
 *   <p>And another, no per-word masking.</p>
 * </Reveal>
 *
 * @example
 * <Reveal as="figure" preset="mask" delay={0.1}>
 *   <img src="..." alt="..." />
 * </Reveal>
 */
export function Reveal({
  children,
  as: Tag = "div",
  preset = "fade-up",
  className,
  style,
  delay,
  duration,
  start,
  triggerOnScroll,
}: RevealProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  useReveal(ref, preset, { delay, duration, start, triggerOnScroll });

  return (
    <Tag
      ref={ref}
      className={className}
      data-reveal=""
      // Hidden state lives in the markup (not just the effect) so the first
      // paint is already hidden — no flash. Caller styles win over it.
      style={{ ...REVEAL_HIDDEN_STYLE[preset], ...style }}
    >
      {children}
    </Tag>
  );
}
