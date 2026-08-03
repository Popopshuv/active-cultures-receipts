/**
 * One run, plus its photos, as a ready-to-render receipt payload.
 *
 * The payload comes back fully formed so the client can hold exactly one
 * object and post it unchanged for both the preview and the print. Photos
 * arrive as proxy URLs — the browser has to fetch them same-origin to dither
 * them, see `api/strava/photo`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/apiSession";
import { bestPhotoUrl, getActivity, getActivityPhotos } from "@/lib/strava";
import { buildReceipt } from "@/lib/runFormat";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withSession(request, async (session) => {
    const activity = await getActivity(session.accessToken, id);
    const photos = await getActivityPhotos(session.accessToken, id);

    const photoUrls = photos
      .map(bestPhotoUrl)
      .filter((url): url is string => Boolean(url))
      .map((url) => `/api/strava/photo?url=${encodeURIComponent(url)}`);

    return NextResponse.json({
      ok: true,
      activityId: activity.id,
      // Photos are attached client-side after dithering, so this payload
      // carries none yet.
      payload: buildReceipt(activity),
      photoUrls,
    });
  });
}
