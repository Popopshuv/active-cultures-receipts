/**
 * Central GSAP entry point. Import `gsap` and `ScrollTrigger` from here —
 * never register the plugin in individual components.
 *
 * Registering once (instead of per-component) avoids duplicate registration
 * and gives us a single place to fix the two things that make scroll reveals
 * misfire:
 *
 *  1. The custom mono font loads after first paint and shifts text metrics,
 *     so trigger positions computed before it lands are stale. We refresh
 *     once `document.fonts.ready` resolves.
 *  2. Mobile browsers fire `resize` when the address bar shows/hides, which
 *     would re-trigger reveals mid-scroll. `ignoreMobileResize` suppresses it.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

export { gsap, ScrollTrigger };
