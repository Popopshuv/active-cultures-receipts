"use client";

import { type ReactNode } from "react";
import { BackgroundCanvas } from "./BackgroundCanvas";
import { CanvasBoundary } from "./CanvasBoundary";
import { TransitionController } from "./TransitionController";
import { PageReveal } from "./PageReveal";

interface ClientShellProps {
  children: ReactNode;
  /** Mount the fullscreen 3D canvas. Default `true`. Set to `false` to opt out. */
  canvas3d?: boolean;
}

export function ClientShell({ children, canvas3d = true }: ClientShellProps) {
  return (
    <>
      <TransitionController />
      {/* Boundaried: the backdrop is decorative, and a WebGL failure must not
          be able to unmount the page around it. See CanvasBoundary. */}
      {canvas3d && (
        <CanvasBoundary>
          <BackgroundCanvas />
        </CanvasBoundary>
      )}
      <main className="relative z-10 min-h-screen">
        <PageReveal>{children}</PageReveal>
      </main>
    </>
  );
}
