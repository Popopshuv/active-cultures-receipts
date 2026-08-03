"use client";

import type { CSSProperties, RefObject } from "react";
import { gsap, ScrollTrigger } from "./gsap";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useTransitionStore } from "@/store/useTransitionStore";
import { prefersReducedMotion } from "./prefersReducedMotion";

export type RevealPreset =
  | "fade"
  | "fade-up"
  | "lift"
  | "mask"
  | "scale";

type CustomHandler = (el: HTMLElement) => void;

interface UseRevealOptions {
  /** ScrollTrigger position. Default `"top 85%"`. */
  start?: string;
  /** Fire once vs every entry. Default `true`. */
  once?: boolean;
  /** Set `false` to fire on mount instead of on scroll. Default `true`. */
  triggerOnScroll?: boolean;
  /** Delay before the tween starts. */
  delay?: number;
  /** Duration override. Each preset has a tasteful default. */
  duration?: number;
}

interface PresetSpec {
  /** Hidden start state (GSAP), applied before the tween runs. */
  from: gsap.TweenVars;
  /** Visible end state, including the preset's default duration + ease. */
  to: gsap.TweenVars;
  /**
   * CSS equivalent of `from`, for rendering the hidden state into the
   * server-rendered HTML. This is what actually prevents the first-paint flash
   * — `useEffect`/`useLayoutEffect` run after the SSR markup is already on
   * screen, so the hidden state has to be in the markup itself.
   */
  hidden: CSSProperties;
}

const PRESETS: Record<RevealPreset, PresetSpec> = {
  fade: {
    from: { opacity: 0 },
    to: { opacity: 1, duration: 0.6, ease: "power2.out" },
    hidden: { opacity: 0 },
  },
  "fade-up": {
    from: { opacity: 0, y: 20 },
    to: { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
    hidden: { opacity: 0, transform: "translateY(20px)" },
  },
  lift: {
    from: { opacity: 0, y: 40 },
    to: { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
    hidden: { opacity: 0, transform: "translateY(40px)" },
  },
  mask: {
    from: { clipPath: "inset(0 100% 0 0)" },
    to: { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.inOut" },
    hidden: { clipPath: "inset(0 100% 0 0)" },
  },
  scale: {
    from: { opacity: 0, scale: 0.96, transformOrigin: "center center" },
    to: { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" },
    hidden: { opacity: 0, transform: "scale(0.96)", transformOrigin: "center center" },
  },
};

/**
 * Hidden-state CSS per preset, for pre-hiding reveal targets in server-rendered
 * markup so they never flash visible before animating. `<Reveal>` applies this
 * automatically; honoured-visible fallbacks live in `globals.css` (reduced
 * motion) and `layout.tsx` (`<noscript>`).
 */
export const REVEAL_HIDDEN_STYLE: Record<RevealPreset, CSSProperties> =
  Object.fromEntries(
    (Object.keys(PRESETS) as RevealPreset[]).map((k) => [k, PRESETS[k].hidden]),
  ) as Record<RevealPreset, CSSProperties>;

/**
 * Reveal a non-text element on scroll using one of the system presets, or a
 * custom callback for one-offs. Handles four things you'd otherwise rewrite:
 *
 * 1. Gates on the page-transition phase so reveals don't fire while the page
 *    is fading out / swapping.
 * 2. Pre-sets the hidden start state before paint so a below-the-fold element
 *    never pops, and snaps reduced-motion / no-tween cases to visible so
 *    content is never stuck hidden.
 * 3. Sets up a one-shot `ScrollTrigger` (default `"top 85%"`).
 * 4. Skips the tween entirely under `prefers-reduced-motion`.
 *
 * To avoid the *first-paint* flash on above-the-fold elements, render the
 * hidden state into the markup too — prefer the `<Reveal>` wrapper, which
 * applies `REVEAL_HIDDEN_STYLE` for you.
 *
 * @example
 * useReveal(ref, "fade-up");
 * useReveal(ref, "mask", { delay: 0.2 });
 * useReveal(ref, (el) => gsap.from(el, { ... }));
 */
export function useReveal<T extends HTMLElement>(
  ref: RefObject<T | null>,
  animation: RevealPreset | CustomHandler,
  options: UseRevealOptions = {},
) {
  const {
    start = "top 85%",
    once = true,
    triggerOnScroll = true,
    delay = 0,
    duration,
  } = options;

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const isCustom = typeof animation === "function";
    const preset = isCustom ? null : PRESETS[animation];

    // Reduced motion: snap to the visible end state and bail. The `gsap.set`
    // also clears any hidden state that was rendered into the markup (e.g. by
    // `<Reveal>`), so content is never left hidden.
    if (prefersReducedMotion()) {
      if (preset) gsap.set(el, preset.to);
      return;
    }

    // Apply the hidden start state immediately. The ScrollTrigger fires later,
    // so without this a below-the-fold element paints visible and then pops to
    // hidden the moment you scroll to it. Pre-setting keeps it hidden until the
    // reveal runs.
    if (preset) gsap.set(el, preset.from);

    const run = () => {
      if (isCustom) {
        (animation as CustomHandler)(el);
      } else if (preset) {
        gsap.to(el, { ...preset.to, duration: duration ?? preset.to.duration, delay });
      }
    };

    const setupTrigger = () => {
      if (!triggerOnScroll) {
        run();
        return;
      }
      ScrollTrigger.create({ trigger: el, start, once, onEnter: run });
    };

    const cleanupTriggers = () => {
      ScrollTrigger.getAll().forEach((t) => {
        if (t.trigger === el) t.kill();
      });
    };

    const isReady = (s: ReturnType<typeof useTransitionStore.getState>) =>
      s.phase === "idle" || s.phase === "revealing";

    let unsub: (() => void) | undefined;
    if (isReady(useTransitionStore.getState())) {
      setupTrigger();
    } else {
      unsub = useTransitionStore.subscribe((state) => {
        if (isReady(state)) {
          unsub?.();
          setupTrigger();
        }
      });
    }

    return () => {
      unsub?.();
      cleanupTriggers();
    };
  }, [ref, animation, start, once, triggerOnScroll, delay, duration]);
}
