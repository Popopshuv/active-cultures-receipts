"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";
import { HOUSE_PHOTOS, MAX_RUNNER_PHOTOS } from "@/lib/receiptConfig";
import { toThermalPhotos } from "@/lib/thermal";
import type { ReceiptPayload } from "@/lib/receiptPayload";

/**
 * Pick photos, check the receipt, print it.
 *
 * The preview is not a mock-up of the receipt — it *is* the receipt. The same
 * payload posted here to `/api/receipt` is the one posted to `/api/print`, and
 * both go through one renderer, so the bitmap on screen is the bitmap that
 * hits the paper.
 */

type Phase = "loading" | "ready" | "printing" | "printed" | "error";

const LABEL_STYLE = {
  fontSize: "var(--text-xs)",
  letterSpacing: "0.3em",
  textTransform: "uppercase" as const,
  color: "var(--gray-3)",
};

/** The underlined text button used for every action on this screen. */
const ACTION_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  paddingBottom: "0.3rem",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
  color: "var(--black)",
  borderBottom: "1px solid var(--black)",
};

export function RunContent({ activityId }: { activityId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [basePayload, setBasePayload] = useState<ReceiptPayload | null>(null);
  const [stravaPhotos, setStravaPhotos] = useState<string[]>([]);
  const [chosen, setChosen] = useState<(string | File)[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // The payload that actually prints. Held in a ref so the print handler can
  // send precisely what the preview rendered, with no re-derivation.
  const printPayload = useRef<ReceiptPayload | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // Load the activity.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/strava/activity/${activityId}`);
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.ok) {
          setPhase("error");
          setMessage(body.error ?? "Couldn't load that run.");
          return;
        }
        setBasePayload(body.payload as ReceiptPayload);
        setStravaPhotos(body.photoUrls as string[]);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setMessage("Couldn't load that run.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, router]);

  const toggleStravaPhoto = useCallback((url: string) => {
    setChosen((current) => {
      if (current.includes(url)) return current.filter((p) => p !== url);
      if (current.length >= MAX_RUNNER_PHOTOS) return current;
      return [...current, url];
    });
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    // Snapshot the FileList *now*. Clearing the input's value empties the same
    // FileList object, and a state updater runs later — read it lazily and the
    // list is already gone by the time React calls back.
    const picked = Array.from(files);
    if (picked.length === 0) return;
    setChosen((current) => {
      const room = MAX_RUNNER_PHOTOS - current.length;
      return room <= 0 ? current : [...current, ...picked.slice(0, room)];
    });
  }, []);

  const full = chosen.length >= MAX_RUNNER_PHOTOS;

  const chosenKey = useMemo(
    () =>
      chosen
        .map((p) => (typeof p === "string" ? p : `${p.name}:${p.size}:${p.lastModified}`))
        .join("|"),
    [chosen],
  );

  // Re-render the preview whenever the payload or the photo selection changes.
  useEffect(() => {
    if (!basePayload) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      setRendering(true);
      try {
        // House photos always print, and always last — they're the shop, not
        // the run. Dithering happens here, in the browser, at print size.
        const batch = await toThermalPhotos([...chosen, ...HOUSE_PHOTOS]);
        if (cancelled) return;

        // Say so rather than quietly printing a receipt with fewer photos
        // than were picked.
        setMessage(
          batch.failed > 0
            ? `Couldn't use ${batch.failed} photo${batch.failed > 1 ? "s" : ""}` +
              (batch.reason ? ` — ${batch.reason}` : "")
            : null,
        );

        const payload: ReceiptPayload = { ...basePayload, photos: batch.photos };
        printPayload.current = payload;

        const response = await fetch("/api/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("preview failed");

        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });
      } catch {
        if (!cancelled) setMessage("Couldn't build the preview.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // chosenKey stands in for `chosen` — File objects aren't value-comparable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePayload, chosenKey]);

  // Release the last object URL on unmount.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const print = useCallback(async () => {
    const payload = printPayload.current;
    if (!payload) return;

    setPhase("printing");
    setMessage(null);
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 503) {
        setPhase("ready");
        setMessage("The printer is offline. Grab whoever's running the shop.");
        return;
      }
      if (!response.ok || !body.ok) {
        setPhase("ready");
        setMessage(body.error ?? "Couldn't send it to the printer.");
        return;
      }
      setPhase("printed");
    } catch {
      setPhase("ready");
      setMessage("Couldn't reach the printer.");
    }
  }, []);

  return (
    <section
      style={{
        minHeight: "100vh",
        padding: "var(--page-pad)",
        paddingTop: "6rem",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(2rem, 5vh, 3rem)",
      }}
    >
      <div>
        <RevealText as="p" delay={0.15} triggerOnScroll={false} style={LABEL_STYLE}>
          {phase === "printed" ? "Done" : "Step two of two"}
        </RevealText>

        <RevealText
          as="h1"
          delay={0.3}
          triggerOnScroll={false}
          stagger={0.015}
          style={{
            marginTop: "1.5rem",
            fontSize: "var(--text-reg)",
            lineHeight: 1.3,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          {phase === "printed" ? "Take your receipt" : "Add photos"}
        </RevealText>
      </div>

      {phase === "error" ? (
        <Reveal
          as="p"
          preset="fade"
          triggerOnScroll={false}
          style={{ fontSize: "var(--text-tiny)", color: "var(--gray-3)", lineHeight: 1.6 }}
        >
          {message}
        </Reveal>
      ) : null}

      {phase !== "error" && phase !== "printed" ? (
        <Reveal preset="fade-up" delay={0.45} triggerOnScroll={false}>
          <p style={{ ...LABEL_STYLE, marginBottom: "1rem" }}>
            {chosen.length} of {MAX_RUNNER_PHOTOS} chosen
          </p>

          {stravaPhotos.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "1.25rem",
              }}
            >
              {stravaPhotos.map((url) => {
                const selected = chosen.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => toggleStravaPhoto(url)}
                    className="transition-opacity hover:opacity-50"
                    style={{
                      padding: 0,
                      border: selected
                        ? "1px solid var(--black)"
                        : "1px solid var(--gray-2)",
                      background: "none",
                      cursor: "pointer",
                      opacity: selected ? 1 : 0.55,
                      lineHeight: 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      width={72}
                      height={72}
                      style={{ objectFit: "cover", display: "block" }}
                    />
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Two inputs, not one. `capture` on a single input would force the
              camera and take the camera roll away entirely — and the camera
              path is the reliable one, since it always hands back a JPEG. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              addFiles(event.target.files);
              // Let the same file be picked again after a removal.
              event.target.value = "";
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={full}
              className="transition-opacity hover:opacity-50"
              style={{ ...ACTION_STYLE, opacity: full ? 0.35 : 1 }}
            >
              From your phone
            </button>

            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              disabled={full}
              className="transition-opacity hover:opacity-50"
              style={{ ...ACTION_STYLE, opacity: full ? 0.35 : 1 }}
            >
              Take a photo
            </button>

            {chosen.length > 0 ? (
              <button
                type="button"
                onClick={() => setChosen([])}
                className="transition-opacity hover:opacity-50"
                style={{
                  ...ACTION_STYLE,
                  color: "var(--gray-3)",
                  borderBottom: "none",
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </Reveal>
      ) : null}

      {/* The preview. Rendered at 384px and shown unscaled where there's room,
          with pixelated scaling so the runner sees real dots rather than a
          browser's idea of a smooth photo. */}
      {previewUrl ? (
        <Reveal preset="fade" delay={0.2} triggerOnScroll={false}>
          <p style={{ ...LABEL_STYLE, marginBottom: "0.75rem" }}>
            {rendering ? "Updating" : "Exactly what prints"}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
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
      ) : null}

      {message && phase !== "error" ? (
        <p
          style={{
            fontSize: "var(--text-tiny)",
            color: "var(--gray-3)",
            lineHeight: 1.6,
            maxWidth: "26rem",
          }}
        >
          {message}
        </p>
      ) : null}

      {phase === "ready" || phase === "printing" ? (
        <div style={{ marginTop: "auto", paddingTop: "2rem" }}>
          <button
            type="button"
            onClick={print}
            disabled={rendering || phase === "printing" || !previewUrl}
            className="transition-opacity hover:opacity-50"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              paddingBottom: "0.35rem",
              cursor: "pointer",
              fontSize: "var(--text-sm)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--red)",
              borderBottom: "1px solid var(--red)",
              opacity: rendering || phase === "printing" ? 0.35 : 1,
            }}
          >
            {phase === "printing" ? "Printing" : "Print receipt"}
          </button>
        </div>
      ) : null}

      {phase === "printed" ? (
        <Reveal
          as="p"
          preset="fade-up"
          triggerOnScroll={false}
          style={{
            fontSize: "var(--text-reg)",
            lineHeight: 1.7,
            color: "var(--gray-3)",
            maxWidth: "26rem",
          }}
        >
          It&rsquo;s in the queue. We&rsquo;ve also disconnected your Strava —
          we only needed it for the one run.
        </Reveal>
      ) : null}
    </section>
  );
}
