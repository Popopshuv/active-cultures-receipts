import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server (where layout
 * effects don't run and React would warn). This is the timing GSAP wants for
 * reveals: the hidden → visible tween is wired up before the browser paints the
 * post-hydration frame, so there's no flicker between hydration and animation.
 *
 * Note: this can't prevent the *server-rendered* HTML from painting visible —
 * that's why reveal targets also pre-hide via inline styles / masks at render
 * time (see `Reveal` and `RevealText`).
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
