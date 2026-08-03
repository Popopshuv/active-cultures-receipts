"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTransitionStore } from "@/store/useTransitionStore";
import { ScrollTrigger } from "@/lib/gsap";

/**
 * How long the exit fade runs before we commit the navigation.
 *
 * Must stay >= the fade duration in `PageReveal` (0.3s), or the route swaps
 * while the old page is still visible and you see it flick.
 */
const EXIT_MS = 350;

export function TransitionController() {
  const router = useRouter();
  const pathname = usePathname();
  const hasNavigated = useRef(false);

  useEffect(() => {
    const unsubscribe = useTransitionStore.subscribe((state, prev) => {
      // `TransitionLink` sets "exiting"; something has to move the machine on
      // to "navigating" once the exit fade has played. Without this the store
      // parks on "exiting" forever: `PageReveal` has already faded the page to
      // opacity 0, no navigation is ever issued, and the app renders a blank
      // screen with no error anywhere.
      if (state.phase === "exiting" && prev.phase !== "exiting") {
        setTimeout(() => {
          if (useTransitionStore.getState().phase === "exiting") {
            useTransitionStore.getState().setPhase("navigating");
          }
        }, EXIT_MS);
      }

      if (state.phase === "navigating" && prev.phase === "exiting") {
        if (state.targetPath && !hasNavigated.current) {
          hasNavigated.current = true;
          router.push(state.targetPath);
        }
      }
    });

    return unsubscribe;
  }, [router]);

  // Drive entering/revealing off the actual pathname commit, not wall-clock.
  // React concurrent rendering defers the DOM swap after router.push, so
  // setTimeout-based phase changes can fade in the old page's content.
  useEffect(() => {
    const state = useTransitionStore.getState();
    if (state.phase !== "navigating" || pathname !== state.targetPath) return;

    state.setPhase("entering");
    const t1 = setTimeout(() => {
      // Setting "revealing" lets the new page's reveals arm their triggers
      // (they're created synchronously in their store subscriptions). Refresh
      // on the next frame so ScrollTrigger recomputes positions against the
      // committed new-page layout instead of the old route's.
      useTransitionStore.getState().setPhase("revealing");
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }, 700);
    const t2 = setTimeout(() => {
      useTransitionStore.getState().completeTransition();
      hasNavigated.current = false;
    }, 1300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  // Watchdog. Every reveal on the page gates on the phase being "idle" or
  // "revealing", so any state the machine can get stuck in renders as a blank
  // screen with nothing in the console. A runner at the shop can't debug that.
  // If a transition hasn't finished well after the longest legitimate path
  // (~2s), force it done: worst case the motion is skipped, which beats an
  // invisible page.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useTransitionStore.subscribe((state) => {
      // One timer, restarted on each phase change. Zustand ignores whatever a
      // listener returns, so cleanup has to be handled here rather than by
      // returning a teardown from the subscription.
      clearTimeout(timer);
      if (state.phase === "idle") return;

      timer = setTimeout(() => {
        if (useTransitionStore.getState().phase !== "idle") {
          console.warn("[transition] stuck — forcing idle");
          useTransitionStore.getState().completeTransition();
          hasNavigated.current = false;
        }
      }, 5000);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
