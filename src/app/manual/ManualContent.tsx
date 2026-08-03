"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RevealText } from "@/components/RevealText";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { PhotoStrip } from "@/components/receipt/PhotoStrip";
import { ReceiptPreview } from "@/components/receipt/ReceiptPreview";
import { EMPTY_RUN, buildManualReceipt, type ManualRun } from "@/lib/manualReceipt";
import { DEFAULT_DURATION, DEFAULT_MILES } from "@/lib/manualDefaults";
import { PRINTED_RESET_MS, PRINT_STYLE, LABEL_STYLE } from "@/lib/receiptScreen";
import { usePhotoPicker } from "@/lib/usePhotoPicker";
import { useReceiptPreview } from "@/lib/useReceiptPreview";

/**
 * A receipt without Strava.
 *
 * Every field is optional. The preview updates as you type, so the defaults
 * aren't a hidden fallback — you can see exactly what an empty form prints
 * before deciding whether to fill anything in.
 */

type Phase = "ready" | "printing" | "printed";

/** No supplied photos here — everything comes off the phone. */
const NO_SUPPLIED_PHOTOS: string[] = [];

const FIELD_STYLE = {
  width: "100%",
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--gray-2)",
  borderRadius: 0,
  padding: "0.5rem 0",
  fontFamily: "var(--font-abc)",
  fontSize: "var(--text-reg)",
  letterSpacing: "0.02em",
  color: "var(--black)",
  outline: "none",
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "decimal" | "numeric";
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: FieldProps) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ ...LABEL_STYLE, display: "block", marginBottom: "0.4rem" }}>
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={FIELD_STYLE}
      />
    </label>
  );
}

export function ManualContent() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<ManualRun>(EMPTY_RUN);

  // One clock read for the whole visit. The payload is rendered twice — once
  // to preview, once to print — and a second reading would make the stamp on
  // the paper differ from the stamp that was approved.
  const [now] = useState(() => new Date());
  const [ticket] = useState(
    () => `#${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
  );

  const picker = usePhotoPicker(NO_SUPPLIED_PHOTOS);

  // Rebuilt on every keystroke, which is what makes the preview live. Cheap:
  // it's string formatting, and the dithering downstream is keyed off the
  // photo selection rather than off this.
  const basePayload = useMemo(
    () => buildManualReceipt(run, { now, ticket }),
    [run, now, ticket],
  );

  const preview = useReceiptPreview(
    basePayload,
    picker.sources,
    // The form is part of the signature: typing a new distance has to redraw
    // the receipt, not just a new photo selection.
    `${picker.signature}|${run.title}|${run.miles}|${run.duration}|${run.startedAt}`,
  );

  // Ask for permission to print before the runner has filled anything in, so
  // the round trip is already done by the time they tap. See api/manual/start.
  useEffect(() => {
    fetch("/api/manual/start", { method: "POST" }).catch(() => {
      // Nothing to do here — the print attempt reports it far more usefully
      // than a warning on a screen nobody is reading yet.
    });
  }, []);

  const set = useCallback(
    (field: keyof ManualRun) => (value: string) =>
      setRun((current) => ({ ...current, [field]: value })),
    [],
  );

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
      if (response.status === 401) {
        setPhase("ready");
        setMessage("That took a while and the session expired. Reload and try again.");
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

  // Hand the screen back for whoever scans the QR code next.
  useEffect(() => {
    if (phase !== "printed") return;
    const timer = setTimeout(() => router.replace("/"), PRINTED_RESET_MS);
    return () => clearTimeout(timer);
  }, [phase, router]);

  const hasPrintBlock = phase === "ready" || phase === "printing";
  const busy = preview.rendering || phase === "printing";

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
        minHeight: "100dvh",
        padding: "var(--page-pad)",
        paddingTop: "6rem",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(2rem, 5vh, 3rem)",
      }}
    >
      <div>
        <RevealText as="p" delay={0.15} triggerOnScroll={false} style={LABEL_STYLE}>
          {phase === "printed" ? "Done" : "No Strava needed"}
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
          {phase === "printed" ? "Take your receipt" : "Your run"}
        </RevealText>
      </div>

      {phase !== "printed" ? (
        <>
          <Reveal preset="fade-up" delay={0.45} triggerOnScroll={false}>
            <p
              style={{
                fontSize: "var(--text-tiny)",
                color: "var(--gray-3)",
                lineHeight: 1.6,
                maxWidth: "26rem",
                marginBottom: "1.75rem",
              }}
            >
              Fill in what you know. Anything you skip gets a sensible
              stand-in, and the receipt below shows exactly what prints.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                maxWidth: "22rem",
              }}
            >
              <Field
                label="Distance (miles)"
                value={run.miles}
                onChange={set("miles")}
                placeholder={DEFAULT_MILES}
                inputMode="decimal"
              />
              <Field
                label="Time"
                value={run.duration}
                onChange={set("duration")}
                placeholder={DEFAULT_DURATION}
                inputMode="text"
              />
              <Field
                label="Name"
                value={run.title}
                onChange={set("title")}
                placeholder={basePayload.title}
              />
              <Field
                label="When"
                value={run.startedAt}
                onChange={set("startedAt")}
                type="datetime-local"
              />
            </div>
          </Reveal>

          <Reveal preset="fade-up" delay={0.6} triggerOnScroll={false}>
            <PhotoStrip picker={picker} />
          </Reveal>
        </>
      ) : null}

      {preview.url ? (
        <ReceiptPreview
          url={preview.url}
          rendering={preview.rendering}
          action={hasPrintBlock ? printButton : undefined}
        />
      ) : null}

      {notice ? (
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
          It&rsquo;s in the queue.
        </Reveal>
      ) : null}

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
