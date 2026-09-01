import type { NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@pdm/shared/logger";
import { submitFreeScan } from "@/server/services/free-scan";

/**
 * `POST /api/public/free-scan` — PLAN.md §3.2, §10.4, Phase 6 task 6.5.
 *
 * ⚠️ THE ONLY UNAUTHENTICATED ENDPOINT THAT CAUSES US TO FETCH SOMETHING. Every
 * abuse control lives in `submitFreeScan`, in one ordered pipeline, precisely so
 * this handler cannot accidentally skip one — a route that assembled the checks
 * itself would eventually grow a second caller that assembled them differently.
 *
 * ⚠️ THE STATUS CODES ARE DELIBERATE. A rate limit is 429 with `Retry-After` so
 * a well-behaved client backs off; a blocked address is 400, NOT 403, because
 * 403 says "you are not allowed" and invites someone to find out how to be.
 */

const schema = z.object({
  // Length-bounded before anything parses it. Normalization handles the rest.
  url: z.string().min(4).max(2_048),
  turnstileToken: z.string().max(4_096).default(""),
});

/** ⚠️ Trusted only as far as the platform's proxy — see the note in §10.4. */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

const STATUS: Record<string, number> = {
  INVALID_URL: 400,
  BLOCKED_ADDRESS: 400,
  DOMAIN_BLOCKED: 400,
  CHALLENGE_FAILED: 400,
  RATE_LIMITED_IP: 429,
  RATE_LIMITED_DOMAIN: 429,
  AT_CAPACITY: 503,
};

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "INVALID_URL" }, { status: 400 });
  }

  try {
    const outcome = await submitFreeScan({
      url: parsed.data.url,
      turnstileToken: parsed.data.turnstileToken,
      ip: clientIp(request),
    });

    if (outcome.ok) return Response.json({ token: outcome.token }, { status: 202 });

    return Response.json(
      { error: outcome.code },
      {
        status: STATUS[outcome.code] ?? 400,
        headers: outcome.retryAfterSeconds
          ? { "Retry-After": String(outcome.retryAfterSeconds) }
          : undefined,
      },
    );
  } catch (error) {
    /*
     * ⚠️ NOTHING FROM THE ERROR REACHES THE RESPONSE. This endpoint takes an
     * arbitrary URL and does DNS resolution against it; an exception message
     * here can name an internal host, a resolver failure or a stack path. The
     * caller gets a code, and we get the detail in the log.
     */
    logger.error({ component: "free-scan", err: error }, "free scan submission failed");
    return Response.json({ error: "AT_CAPACITY" }, { status: 503 });
  }
}
