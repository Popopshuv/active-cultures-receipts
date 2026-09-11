import type { Viewport } from "next";
import { ManualContent } from "./ManualContent";

/**
 * iOS Safari zooms into any input set under 16px, and this form's inputs sit
 * at `--text-reg`. Capping the scale stops that focus zoom without resizing
 * the type. `userScalable` is left alone, so pinch-to-zoom still works — iOS
 * ignores `maximumScale` for pinches.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function Manual() {
  return <ManualContent />;
}
