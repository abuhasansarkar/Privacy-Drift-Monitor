import type { NextRequest } from "next/server";
import { z } from "zod";
import { ANALYTICS_EVENTS, track, type AnalyticsEvent } from "@pdm/shared/analytics";

/**
 * `POST /api/public/analytics` — PLAN.md §9.6, Phase 6 task 6.8.
 *
 * ⚠️ IT EXISTS BECAUSE SOME EVENTS ONLY HAPPEN IN A BROWSER. `pricing_viewed`,
 * `pricing_interval_toggled` and `free_scan_signup_clicked` have no server
 * moment at all — the pricing page is statically prerendered, so a server-side
 * emit would fire once at build time and never again.
 *
 * ⚠️ THE EVENT NAME IS VALIDATED AGAINST THE ALLOWLIST. This endpoint is
 * unauthenticated by necessity, so without it anyone could write arbitrary
 * event names into our funnel data and make every metric in §9.7 unusable.
 *
 * ⚠️ PROPERTIES ARE FILTERED BY THE SAME §9.6 RULE AS EVERY OTHER CALLER.
 * `track()` runs `assertSafeProperties`, so a browser cannot post a `domain`
 * key and have it stored — the privacy discipline is not a client-side promise.
 *
 * ⚠️ IT RETURNS 204 WHATEVER HAPPENS. A page must never show an error because
 * telemetry was rejected, and a caller learning which event names are valid is
 * a caller learning our funnel.
 */
const schema = z.object({
  event: z.string().max(64),
  properties: z
    .record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response(null, { status: 204 });

    if (!(ANALYTICS_EVENTS as readonly string[]).includes(parsed.data.event)) {
      return new Response(null, { status: 204 });
    }

    await track(parsed.data.event as AnalyticsEvent, parsed.data.properties ?? {});
  } catch {
    // Deliberately silent — see the note above.
  }
  return new Response(null, { status: 204 });
}
