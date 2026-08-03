"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a failing 3D backdrop from taking the page with it.
 *
 * The canvas is decorative. Everything else on screen — the run picker, the
 * receipt preview, the print button — is not. But a throw inside the R3F tree
 * propagates up and, with no boundary, unmounts everything above it. Because
 * reveal targets pre-hide themselves in the markup to avoid a first-paint
 * flash, the result isn't a partial render or an error message: it's a blank
 * white page with content that is present in the DOM and permanently
 * invisible.
 *
 * WebGL is the most likely thing to fail on a phone — context creation can be
 * refused outright under memory pressure, and iOS caps the number of live
 * contexts per tab. So the backdrop gets a boundary and the app doesn't care
 * whether it works.
 */
export class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Loud in the console, silent on screen — nobody at the shop should learn
    // that the background sphere didn't load.
    console.warn("[canvas] background disabled after error:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
