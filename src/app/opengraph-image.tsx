import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/lib/siteConfig";

// Next auto-wires the output of this file as og:image AND twitter:image for
// the whole site. iMessage / Slack / Twitter previews render this card.
export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Design tokens, mirrored from globals.css (ImageResponse can't read CSS vars).
const BLACK = "#1a1a1a";
const WHITE = "#ffffff";
const RED = "#ff0000";

export default async function OpengraphImage() {
  // Use the system's mono face so the card matches the site. woff is supported
  // by the underlying renderer (woff2 is not). Fall back silently if missing.
  let fontData: ArrayBuffer | undefined;
  try {
    const buf = await readFile(
      join(process.cwd(), "public/fonts/ABCMonumentGroteskMono-Light.woff"),
    );
    fontData = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    // No font file — ImageResponse falls back to its default sans.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BLACK,
          color: WHITE,
          padding: "80px",
          fontFamily: fontData ? "ABCMonumentGrotesk" : "monospace",
          fontWeight: 300,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: WHITE,
            opacity: 0.6,
          }}
        >
          {siteConfig.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.15,
              letterSpacing: "0.04em",
              maxWidth: "900px",
            }}
          >
            {siteConfig.description}
          </div>
          <div style={{ width: "64px", height: "4px", background: RED }} />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: "ABCMonumentGrotesk", data: fontData, weight: 300, style: "normal" }]
        : undefined,
    },
  );
}
