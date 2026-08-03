"use client";

import { useRef } from "react";
import { MAX_RUNNER_PHOTOS } from "@/lib/receiptConfig";
import type { PhotoPicker } from "@/lib/usePhotoPicker";

/**
 * Pick the photos that go on the receipt.
 *
 * One strip, whatever the source: ready-made photos and camera-roll photos
 * behave identically, and the number on a selected photo is where it lands on
 * the paper.
 */

const LABEL_STYLE = {
  fontSize: "var(--text-xs)",
  letterSpacing: "0.3em",
  textTransform: "uppercase" as const,
  color: "var(--gray-3)",
};

/** The underlined text button used for every action on these screens. */
export const ACTION_STYLE = {
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

export function PhotoStrip({ picker }: { picker: PhotoPicker }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { options, chosen, full, toggle, addFiles, clear } = picker;

  return (
    <>
      {/* When the selection is full, tapping an unselected photo does
          nothing — say why rather than letting it read as a broken tap. */}
      <p style={{ ...LABEL_STYLE, marginBottom: "1rem" }}>
        {chosen.length} of {MAX_RUNNER_PHOTOS} chosen
        {full ? " — remove one to swap" : null}
      </p>

      {options.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "1.25rem",
          }}
        >
          {options.map((option) => {
            const order = chosen.indexOf(option.key);
            const selected = order !== -1;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => toggle(option.key)}
                aria-pressed={selected}
                className="transition-opacity hover:opacity-50"
                style={{
                  position: "relative",
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
                  src={option.url}
                  alt=""
                  width={72}
                  height={72}
                  style={{ objectFit: "cover", display: "block" }}
                />
                {selected ? (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      minWidth: "1.25rem",
                      padding: "0.15rem 0.3rem",
                      background: "var(--black)",
                      color: "var(--white)",
                      fontSize: "var(--text-sm)",
                      letterSpacing: "0.02em",
                      lineHeight: 1.2,
                    }}
                  >
                    {order + 1}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* No `capture` attribute: iOS already offers Photo Library / Take
          Photo / Choose Files from this one input, and setting `capture`
          would replace that sheet with the camera outright. */}
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

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="transition-opacity hover:opacity-50"
          style={ACTION_STYLE}
        >
          Add a photo
        </button>

        {chosen.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="transition-opacity hover:opacity-50"
            style={{ ...ACTION_STYLE, color: "var(--gray-3)", borderBottom: "none" }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </>
  );
}
