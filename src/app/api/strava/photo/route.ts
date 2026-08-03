/**
 * Same-origin proxy for Strava-hosted photos.
 *
 * The photo pipeline reads pixels back out of a canvas to dither them, and a
 * cross-origin image taints the canvas — `getImageData` then throws a security
 * error. Strava's CDN doesn't send us CORS headers, so the only way to touch
 * those pixels is to serve them from our own origin.
 *
 * The host allowlist is what stops this from being an open proxy that anyone
 * on the internet can point at our internal network.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Strava serves activity photos from CloudFront and its own subdomains. */
const ALLOWED_HOSTS = [
  "dgalywyr863hv.cloudfront.net",
  "d3nn82uaxijpm6.cloudfront.net",
  "content.strava.com",
  "graph.strava.com",
];

function isAllowed(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return ALLOWED_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json({ ok: false, error: "missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
  }

  if (!isAllowed(parsed)) {
    return NextResponse.json({ ok: false, error: "host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed, {
      // Don't forward cookies or auth to a third-party CDN.
      credentials: "omit",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "not an image" }, { status: 415 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // Safe to cache: the URL fully identifies the image, and Strava's photo
      // URLs are content-addressed.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
