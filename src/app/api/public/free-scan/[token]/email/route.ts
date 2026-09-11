import type { NextRequest } from "next/server";
import { z } from "zod";
import { unsafeGlobalClient } from "@pdm/database";
import { domainHash, track } from "@pdm/shared/analytics";
import { logger } from "@pdm/shared/logger";
import { checkRateLimit, rateLimitKey } from "@pdm/shared/rate-limit";
import { rateLimitStore } from "@/server/services/queues";
import { getClientIp } from "@/server/client-ip";

/**
 * `POST /api/public/free-scan/[token]/email` — Lead capture email submission.
 *
 * Saves the recipient's email address to the `FreeScan` record so they can
 * receive their report and continue to full onboarding.
 *
 * ⚠️ RATE LIMITED (F-040). This is an unauthenticated endpoint that writes a
 * PII column (an email address) keyed by a guessable-ish token, and the UI
 * promises "receive your report" — which nothing yet fulfils server-side. The
 * write is capped per-IP until the delivery pipeline lands; a written email
 * that nothing consumes is a liability, so the limiter bounds how fast the
 * liability can grow.
 */

const db = unsafeGlobalClient(
  "free scanner lead email submission; pre-tenant record updated by token",
);

const schema = z.object({
  email: z.string().email().max(200),
});

/** Generous for a person, useless for a scraper. */
const RULE = { limit: 5, windowSeconds: 60 * 60 };

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/public/free-scan/[token]/email">,
): Promise<Response> {
  const { token } = await context.params;

  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  // Per-IP budget, same derivation as the free-scan submission route (F-009).
  const ip = getClientIp(request.headers) ?? "unknown";
  try {
    const perIp = await checkRateLimit(
      rateLimitStore(),
      rateLimitKey("free-scan-email:ip", ip),
      RULE,
    );
    if (!perIp.allowed) {
      return Response.json(
        { error: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(perIp.resetSeconds) } },
      );
    }
  } catch {
    // A limiter outage must not 500 an email capture. Fail open here — the
    // write is idempotent per token, so the blast radius is bounded.
  }

  const scan = await db.freeScan.findUnique({
    where: { token },
    select: { id: true, url: true, expiresAt: true },
  });

  if (!scan || scan.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    await db.freeScan.update({
      where: { token },
      data: { email: parsed.data.email },
    });

    void track("free_scan_email_submitted", {
      freeScanId: scan.id,
      domain_hash: domainHash(scan.url),
    });

    return Response.json({ ok: true });
  } catch (error) {
    logger.error(
      { component: "free-scan-email", err: error },
      "failed to save free scan email",
    );
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
