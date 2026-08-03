/**
 * Route signature — turning a Strava activity into the line drawing that goes
 * on the receipt.
 *
 * Strava ships the GPS track on every activity as `map.summary_polyline`, in
 * Google's encoded-polyline format. That's all we need: decode it, flatten it
 * to a 2D path, and hand the renderer an SVG.
 *
 * No dependency for any of this. The decoder is ~25 lines of well-specified
 * bit-twiddling, and the projection is one cosine.
 */

/** A decoded track point, in degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Decode a Google encoded polyline into lat/lng pairs.
 *
 * The format packs each coordinate as a delta from the previous one, in
 * units of 1e-5 degrees, zig-zag encoded into 5-bit chunks with a
 * continuation bit. See Google's "Encoded Polyline Algorithm Format".
 *
 * Returns an empty array for malformed input rather than throwing — a bad
 * polyline should cost you the route drawing, not the whole receipt.
 */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];

  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  try {
    while (index < encoded.length) {
      // Each coordinate delta is a run of 5-bit chunks, low bits first, with
      // bit 6 set on every chunk except the last.
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        if (Number.isNaN(byte)) return points;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      // Zig-zag: the low bit is the sign.
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        if (Number.isNaN(byte)) return points;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
  } catch {
    return points;
  }

  return points;
}

interface RouteSvgOptions {
  /** Box to fit the route into, in print pixels. */
  width: number;
  height: number;
  /** Stroke weight. Keep >= 2 — a 1px stroke greys out under thresholding. */
  stroke?: number;
  /** Inset from the box edge so the track never touches the border. */
  padding?: number;
}

/**
 * Project a track and render it as standalone SVG markup.
 *
 * Projection is equirectangular with a cosine correction on longitude, which
 * is right to within a rounding error at the scale of a single run. Aspect
 * ratio is preserved and the result is centred, so a there-and-back loop
 * doesn't get stretched into something that looks nothing like the run.
 *
 * Returns null when there isn't enough of a track to draw — the caller should
 * drop the route section entirely rather than print an empty box.
 */
export function routeToSvg(
  points: LatLng[],
  { width, height, stroke = 2, padding = 4 }: RouteSvgOptions,
): string | null {
  if (points.length < 2) return null;

  const meanLat =
    (points.reduce((sum, p) => sum + p.lat, 0) / points.length) * (Math.PI / 180);
  const lngScale = Math.cos(meanLat);

  // Project to an abstract plane: x east, y south (SVG's y grows downward).
  const projected = points.map((p) => ({
    x: p.lng * lngScale,
    y: -p.lat,
  }));

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // A track that never moved (treadmill, lost GPS lock) has nothing to draw.
  if (spanX === 0 && spanY === 0) return null;

  const boxW = width - padding * 2;
  const boxH = height - padding * 2;
  // One scale for both axes — this is what keeps the shape honest.
  const scale = Math.min(
    spanX > 0 ? boxW / spanX : Infinity,
    spanY > 0 ? boxH / spanY : Infinity,
  );

  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (boxW - drawnW) / 2;
  const offsetY = padding + (boxH - drawnH) / 2;

  const round = (n: number) => Math.round(n * 10) / 10;
  const d = projected
    .map((p, i) => {
      const x = round(offsetX + (p.x - minX) * scale);
      const y = round(offsetY + (p.y - minY) * scale);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<path d="${d}" fill="none" stroke="#000000" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/**
 * Same as `routeToSvg`, base64'd into a data URI.
 *
 * The renderer embeds this as an `<img>` rather than inline SVG: satori's
 * inline-SVG support is narrower than its image support, and a data URI is one
 * less thing that can silently render as a blank box.
 */
export function routeToDataUri(
  points: LatLng[],
  options: RouteSvgOptions,
): string | null {
  const svg = routeToSvg(points, options);
  if (!svg) return null;
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(svg, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Convenience: encoded polyline straight to a data URI, or null.
 */
export function polylineToDataUri(
  encoded: string | null | undefined,
  options: RouteSvgOptions,
): string | null {
  if (!encoded) return null;
  return routeToDataUri(decodePolyline(encoded), options);
}
