"use client";

import { useEffect, useRef, useState } from "react";
import { HOUSE_PHOTOS } from "./receiptConfig";
import { toThermalPhotos } from "./thermal";
import type { ReceiptPayload } from "./receiptPayload";

/**
 * Render the receipt the runner is about to print.
 *
 * The preview is not a mock-up — it *is* the receipt. The payload this builds
 * is handed back through `payload`, and the caller posts that exact object to
 * `/api/print`, so the bitmap on screen is the bitmap that hits the paper.
 */

export interface ReceiptPreview {
  /** Object URL of the rendered PNG, or null before the first render. */
  url: string | null;
  /** True while a render is in flight. */
  rendering: boolean;
  /** Photo or render trouble, in words. Null when everything worked. */
  notice: string | null;
  /**
   * Exactly what was previewed.
   *
   * A ref, not state: the print handler needs the payload the preview rendered,
   * and re-deriving it at click time is how the printed receipt drifts from the
   * approved one.
   */
  payload: React.RefObject<ReceiptPayload | null>;
}

/**
 * @param base   The receipt minus photos. Null until it's known.
 * @param sources Photos to dither, in print order.
 * @param signature Changes exactly when `sources` does. Drives the re-render,
 *   because `File` objects aren't value-comparable and the array's identity
 *   changes on every render.
 */
export function useReceiptPreview(
  base: ReceiptPayload | null,
  sources: readonly (string | File)[],
  signature: string,
): ReceiptPreview {
  const [url, setUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const payload = useRef<ReceiptPayload | null>(null);

  // Read inside the effect so the effect doesn't have to depend on an array
  // whose identity changes every render. Synced from an effect rather than
  // during render, and declared *before* the render effect below so it has
  // already run by the time that one reads it — effects fire in source order.
  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  });

  useEffect(() => {
    if (!base) return;
    let cancelled = false;

    (async () => {
      setRendering(true);
      try {
        // House photos always print, and always last — they're the shop, not
        // the run. Dithering happens here, in the browser, at print size.
        const batch = await toThermalPhotos([
          ...sourcesRef.current,
          ...HOUSE_PHOTOS,
        ]);
        if (cancelled) return;

        // Say so rather than quietly printing a receipt with fewer photos
        // than were picked.
        setNotice(
          batch.failed > 0
            ? `Couldn't use ${batch.failed} photo${batch.failed > 1 ? "s" : ""}` +
              (batch.reason ? ` — ${batch.reason}` : "")
            : null,
        );

        const next: ReceiptPayload = { ...base, photos: batch.photos };
        payload.current = next;

        const response = await fetch("/api/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("preview failed");

        const blob = await response.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });
      } catch {
        if (!cancelled) setNotice("Couldn't build the preview.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `signature` stands in for `sources`. See the parameter note.
  }, [base, signature]);

  // Release the last object URL on unmount.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return { url, rendering, notice, payload };
}
