"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { PhotoStrip } from "@/components/receipt/PhotoStrip";
import { ReceiptPreview } from "@/components/receipt/ReceiptPreview";
import { PRINTED_RESET_MS, PRINT_STYLE, LABEL_STYLE } from "@/lib/receiptScreen";
import { usePhotoPicker } from "@/lib/usePhotoPicker";
import { useReceiptPreview } from "@/lib/useReceiptPreview";
import type { ReceiptPayload } from "@/lib/receiptPayload";

/**
 * Pick photos, check the receipt, print it.
 *
 * The Strava half of the story. Everything below the activity load — the photo
 * strip, the preview, the print button — is shared with the hand-filled flow in
 * `app/manual`.
 */

type Phase = "loading" | "ready" | "printing" | "printed" | "error";

export function RunContent({ activityId }: { activityId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [basePayload, setBasePayload] = useState<ReceiptPayload | null>(null);
  const [stravaPhotos, setStravaPhotos] = useState<string[]>([]);

  const picker = usePhotoPicker(stravaPhotos);
  const preview = useReceiptPreview(basePayload, picker.sources, picker.signature);

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

  // A plain function, not a useCallback: it reads `payload.current`, and the
  // React Compiler refuses to optimise a component whose manual dependency list
  // can't account for a ref read. It memoises this for us.
  const print = async () => {
    const payload = preview.payload.current;
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
  };

  // Hand the screen back once the receipt is printing. `replace`, not `push`:
  // the run this points at needs a Strava session that no longer exists, so
  // leaving it in history would only offer the runner a dead page to go back to.
  useEffect(() => {
    if (phase !== "printed") return;
    const timer = setTimeout(() => router.replace("/"), PRINTED_RESET_MS);
    return () => clearTimeout(timer);
  }, [phase, router]);

  const hasPrintBlock = phase === "ready" || phase === "printing";
  const busy = preview.rendering || phase === "printing";

  // Rendered in two places. Built once so the disabled state, the label and
  // the styling can't drift between the copy above the preview and the one
  // below it.
  const printButton = (
    <button
      type="button"
      onClick={print}
      disabled={busy || !preview.url}
      className="transition-opacity hover:opacity-50"
      style={{ ...PRINT_STYLE, opacity: busy ? 0.35 : 1 }}
    >
      {phase === "printing" ? "Printing" : "Print receipt"}
    </button>
  );

  const notice = message ?? preview.notice;

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
          <PhotoStrip picker={picker} />
        </Reveal>
      ) : null}

      {preview.url ? (
        <ReceiptPreview
          url={preview.url}
          rendering={preview.rendering}
          action={hasPrintBlock ? printButton : undefined}
        />
      ) : null}

      {notice && phase !== "error" ? (
        <p
          style={{
            fontSize: "var(--text-tiny)",
            color: "var(--gray-3)",
            lineHeight: 1.6,
            maxWidth: "26rem",
          }}
        >
          {notice}
        </p>
      ) : null}

      {hasPrintBlock ? (
        <div style={{ marginTop: "auto", paddingTop: "2rem" }}>{printButton}</div>
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

      {/* Only claim the leftover space when the print block above isn't
          already claiming it — two `marginTop: auto` siblings split the free
          space between them and leave the button stranded mid-page. */}
      <div
        style={{
          marginTop: hasPrintBlock ? undefined : "auto",
          paddingTop: "2rem",
        }}
      >
        <SiteFooter delay={0.4} />
      </div>
    </section>
  );
}
