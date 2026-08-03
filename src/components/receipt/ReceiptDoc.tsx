/**
 * The receipt, as layout.
 *
 * This is the only place the receipt is composed. It renders through
 * `next/og` (satori → resvg) into a PNG at `HEAD_DOTS` wide, and that one PNG
 * is both what the runner previews and what the Pi burns onto paper.
 *
 * ## Satori is not a browser
 *
 * It implements a subset of CSS. Things that matter here:
 *
 * - **Every element with more than one child needs an explicit
 *   `display: flex`.** Satori throws otherwise, and the error points at the
 *   parent rather than the child that triggered it.
 * - **No React fragments.** Satori doesn't flatten `<>…</>` into the parent —
 *   it lays the fragment out as its own box, in the default `row` direction.
 *   A `<><Rule/><div/></>` therefore puts the content *next to* the rule,
 *   which pushes it clean off the 384px canvas and prints as blank space.
 *   Every conditional block below uses a real `<Block>` element instead.
 * - Default flex direction is `row`, so every column says so.
 * - No `grid`, no `float`, no CSS variables — the tokens come in as literals
 *   from `receiptConfig`, the same compromise `app/opengraph-image.tsx` makes.
 * - Margins, not `gap`, for vertical rhythm. Both work, but margins keep the
 *   spacing readable next to the height estimator in `receiptHeight.ts`.
 */

import {
  MASTHEAD,
  CONTENT_WIDTH,
  GAP,
  HEAD_DOTS,
  INK,
  LINE_H,
  PAD,
  PAPER,
  PHOTO_WIDTH,
  ROUTE,
  TRACKING,
  TYPE,
  ATTRIBUTION,
} from "@/lib/receiptConfig";
import type { ReceiptPayload, ReceiptStat } from "@/lib/receiptPayload";
import { polylineToDataUri } from "@/lib/polyline";

/** Horizontal rule with its own air above and below. */
function Rule() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 1,
        backgroundColor: INK,
        marginTop: GAP.rule,
        marginBottom: GAP.rule,
      }}
    />
  );
}

/**
 * A full-width column. Used everywhere a fragment would be natural — see the
 * satori note above for why fragments can't be.
 */
function Block({
  children,
  align = "stretch",
}: {
  children: React.ReactNode;
  align?: "stretch" | "center";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CONTENT_WIDTH,
        alignItems: align,
      }}
    >
      {children}
    </div>
  );
}

/** A label-left / value-right row — the shape a receipt is made of. */
function Row({
  label,
  value,
  size = TYPE.body,
  lineHeight = LINE_H.body,
  tracking = TRACKING.body,
  indent = false,
}: {
  label: string;
  value: string;
  size?: number;
  lineHeight?: number;
  tracking?: string;
  indent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        width: "100%",
        height: lineHeight,
        paddingLeft: indent ? 12 : 0,
      }}
    >
      <div style={{ fontSize: size, letterSpacing: tracking }}>{label}</div>
      <div style={{ fontSize: size, letterSpacing: tracking }}>{value}</div>
    </div>
  );
}

/** A full-width line of text. */
function Line({
  children,
  size = TYPE.body,
  lineHeight = LINE_H.body,
  tracking = TRACKING.body,
  align = "left",
}: {
  children: string;
  size?: number;
  lineHeight?: number;
  tracking?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        fontSize: size,
        lineHeight: `${lineHeight}px`,
        letterSpacing: tracking,
        justifyContent: align === "center" ? "center" : "flex-start",
        textAlign: align,
      }}
    >
      {children}
    </div>
  );
}

export function ReceiptDoc({
  payload,
  mastheadSrc,
}: {
  payload: ReceiptPayload;
  /**
   * The masthead artwork as a data URI, read from disk by `renderReceipt`.
   * Optional so a missing asset costs the logo rather than the whole receipt.
   */
  mastheadSrc?: string;
}) {
  const routeSrc = polylineToDataUri(payload.polyline, {
    width: ROUTE.width,
    height: ROUTE.height,
    stroke: ROUTE.stroke,
    padding: ROUTE.padding,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: HEAD_DOTS,
        backgroundColor: PAPER,
        color: INK,
        padding: `${PAD * 2}px ${PAD}px`,
        fontFamily: "ABCMonumentGrotesk",
        fontWeight: 300,
      }}
    >
      {/* Masthead — artwork, not type. Placed at its native pixel size: it
          arrives already thresholded to 1-bit, and resampling would soften the
          edges back into greys. See MASTHEAD in receiptConfig. */}
      {mastheadSrc ? (
        <Block align="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mastheadSrc}
            width={MASTHEAD.width}
            height={MASTHEAD.height}
            alt=""
          />
        </Block>
      ) : null}

      {/* Title block. Flush left — the artwork above carries the centred
          symmetry, so the type reads better set against the left edge. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: CONTENT_WIDTH,
          marginTop: GAP.section,
        }}
      >
        <Line
          size={TYPE.brand}
          lineHeight={LINE_H.brand}
          tracking={TRACKING.brand}
        >
          {payload.title.toUpperCase()}
        </Line>
        {payload.subtitle ? <Line>{payload.subtitle.toUpperCase()}</Line> : null}
        {payload.dateLine ? (
          <Line
            size={TYPE.label}
            lineHeight={LINE_H.label}
            tracking={TRACKING.label}
          >
            {payload.dateLine.toUpperCase()}
          </Line>
        ) : null}
      </div>

      <Rule />

      {/* Itemised block */}
      <Block>
        {payload.hero ? (
          <Block>
            <Row
              label="COUNT TYPE"
              value={payload.hero.label}
              size={TYPE.label}
              lineHeight={LINE_H.label}
              tracking={TRACKING.label}
            />
            <Row
              label={payload.hero.rowLabel}
              value={payload.hero.value}
              size={TYPE.brand}
              lineHeight={LINE_H.brand}
              tracking={TRACKING.body}
            />
          </Block>
        ) : null}

        {payload.stats.map((stat: ReceiptStat) => (
          <Row
            key={`${stat.label}-${stat.value}`}
            label={stat.label}
            value={stat.value}
            indent={stat.indent}
          />
        ))}
      </Block>

      {payload.total ? (
        <Block>
          <Rule />
          <Row
            label={payload.total.label}
            value={payload.total.value}
            size={TYPE.brand}
            lineHeight={LINE_H.brand}
            tracking={TRACKING.body}
          />
          {payload.total.note ? (
            <div
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "flex-end",
                fontSize: TYPE.micro,
                lineHeight: `${LINE_H.micro}px`,
                letterSpacing: TRACKING.body,
              }}
            >
              {payload.total.note}
            </div>
          ) : null}
        </Block>
      ) : null}

      {/* Route signature — the run itself, drawn as one line. */}
      {routeSrc ? (
        <Block align="center">
          <Rule />
          <Line
            size={TYPE.label}
            lineHeight={LINE_H.label}
            tracking={TRACKING.label}
            align="center"
          >
            {ROUTE.label}
          </Line>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={routeSrc} width={ROUTE.width} height={ROUTE.height} alt="" />
        </Block>
      ) : null}

      {/* Photos. Placed at exactly the size they were dithered at — any
          resampling here would smear the dither into grey mush. */}
      {payload.photos.length > 0 ? (
        <Block>
          <Rule />
          {payload.photos.map((photo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.src.slice(-24)}
              src={photo.src}
              width={PHOTO_WIDTH}
              height={photo.height}
              alt=""
              style={{ marginTop: i === 0 ? 0 : GAP.photo }}
            />
          ))}
        </Block>
      ) : null}

      <Rule />

      {/* Shop details. On the Garmin attribution that used to print here, see
          the note in `receiptConfig.ATTRIBUTION`. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: CONTENT_WIDTH,
        }}
      >
        {(payload.footerLines ?? []).map((line) => (
          <Line
            key={line}
            size={TYPE.label}
            lineHeight={LINE_H.label}
            tracking={TRACKING.label}
          >
            {line}
          </Line>
        ))}
      </div>

      {/* Stamp */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          width: CONTENT_WIDTH,
          marginTop: GAP.section,
          fontSize: TYPE.micro,
          letterSpacing: TRACKING.body,
        }}
      >
        <div style={{ display: "flex" }}>{payload.ticket}</div>
        <div style={{ display: "flex" }}>{payload.stamp}</div>
      </div>

      {/* Studio credit. Below the stamp and a size down from it, so it reads as
          a mark on the ticket rather than another line of the shop's address. */}
      <div
        style={{ display: "flex", width: CONTENT_WIDTH, marginTop: GAP.credit }}
      >
        <Line
          size={TYPE.nano}
          lineHeight={LINE_H.nano}
          tracking={TRACKING.micro}
        >
          {ATTRIBUTION.builtBy}
        </Line>
      </div>
    </div>
  );
}
