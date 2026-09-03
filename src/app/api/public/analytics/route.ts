import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ANALYTICS_EVENTS, track, type AnalyticsEvent } from "@pdm/shared/analytics";
import { checkRateLimit, rateLimitKey } from "@pdm/shared";
import { rateLimitStore } from "@/server/services/queues";

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
 *
 * ⚠️ AND IT IS RATE LIMITED PER IP, WHICH THE ALLOWLIST DOES NOT DO FOR IT.
 * The name check stops somebody inventing event names; it does nothing about
 * VOLUME. An unauthenticated endpoint that writes a row per call is a funnel
 * anyone can poison — a script posting `pricing_viewed` in a loop makes every
 * metric in §9.7 meaningless and, on a metered analytics transport, does it at
 * our expense. The limit is generous enough that a real browsing session never
 * reaches it: these events fire on page views and toggles, not on scroll.
 */

/** Generous for a person, useless for a loop. */
const PER_IP = { limit: 120, windowSeconds: 3_600 };

/**
 * The rate-limit key is a SALTED HASH of the address, never the address.
 * §9.6 keeps raw IPs out of stored telemetry, and a Redis key is storage.
 */
function ipKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const salt = process.env.ANALYTICS_SALT ?? process.env.PORTAL_TOKEN_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
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

    // Checked AFTER the free validations, for the same reason the free scanner
    // orders its controls that way: a malformed body should not cost a Redis
    // round trip. Still 204 when refused — see the note above.
    const limit = await checkRateLimit(
      rateLimitStore(),
      rateLimitKey("analytics-ip", ipKey(request)),
      PER_IP,
    );
    if (!limit.allowed) return new Response(null, { status: 204 });

    await track(parsed.data.event as AnalyticsEvent, parsed.data.properties ?? {});
  } catch {
    // Deliberately silent — see the note above.
  }
  return new Response(null, { status: 204 });
}
