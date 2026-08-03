/**
 * Recent runs for the picker.
 *
 * Returns a trimmed shape rather than Strava's full activity objects — the
 * picker needs a name, a distance and a route thumbnail, and there's no reason
 * to ship an athlete's full activity record to the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/apiSession";
import { listActivities } from "@/lib/strava";
import { duration, miles, startedAt } from "@/lib/runFormat";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withSession(request, async (session) => {
    const activities = await listActivities(session.accessToken);

    return NextResponse.json({
      ok: true,
      athlete: session.name,
      activities: activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        miles: miles(activity.distance),
        duration: duration(activity.moving_time),
        startedAt: startedAt(activity.start_date_local),
        // Enough to draw a thumbnail of the route in the picker.
        polyline: activity.map?.summary_polyline ?? null,
        photoCount: activity.total_photo_count ?? 0,
      })),
    });
  });
}
