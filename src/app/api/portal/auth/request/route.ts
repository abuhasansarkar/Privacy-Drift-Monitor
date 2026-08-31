import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { renderMessage } from "@pdm/email";
import { resolveBranding } from "@pdm/reports/branding";
import { enqueueEmail } from "@pdm/scanner/queue/queues";
import { portal as portalSchemas } from "@pdm/schemas";
import { childLogger } from "@pdm/shared/logger";
import {
  checkRateLimit,
  memoryRateLimitStore,
  rateLimitKey,
} from "@pdm/shared/rate-limit";
import { issueMagicLink } from "@/server/portal/session";
import { emailQueue } from "@/server/services/queues";

/**
 * MAGIC-LINK REQUEST — PLAN.md §6.10.
 *
 * ⚠️ ALWAYS 204, NO MATTER WHAT. Unknown address, revoked contact, rate-limited,
 * malformed body, mail queue down — every path answers the same. §6.10 lists
 * enumeration as a named control, and the endpoint's whole security posture is
 * that its response carries no information about who has access.
 *
 * ⚠️ RATE LIMITED PER EMAIL **AND** PER IP: five per hour each (§6.10). Per
 * email alone lets one host walk an address list; per IP alone lets a
 * distributed attempt hammer one mailbox.
 *
 * ⚠️ NO CLERK. This route is excluded in `proxy.ts` and imports nothing from
 * it — portal sign-in has to work during a Clerk outage.
 */

const log = childLogger({ component: "portal" });

/**
 * In-memory for now, which is honest about what it is: single-instance only.
 * Redis-backed limiting arrives with the rest of the abuse controls in Phase 7
 * (§10.4); the interface here does not change.
 */
const store = memoryRateLimitStore();

const RULE = { limit: 5, windowSeconds: 60 * 60 };

export async function POST(request: Request) {
  // The 204 is built once and returned from every path below, so no branch can
  // accidentally answer differently.
  const noContent = new NextResponse(null, { status: 204 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = portalSchemas.requestMagicLinkSchema.safeParse(body);
    if (!parsed.success) return noContent;

    const email = parsed.data.email;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex");

    const [byEmail, byIp] = await Promise.all([
      checkRateLimit(store, rateLimitKey("portal-magic-link:email", email), RULE),
      checkRateLimit(store, rateLimitKey("portal-magic-link:ip", ipHash), RULE),
    ]);
    if (!byEmail.allowed || !byIp.allowed) {
      // Logged, not returned. A 429 here would tell an attacker their probe
      // was interesting enough to throttle.
      log.warn({ ipHash }, "portal magic-link request rate limited");
      return noContent;
    }

    const issued = await issueMagicLink(email);
    if (!issued) return noContent;

    // ⚠️ Agency-branded (§9.5): the client contact hears from their agency.
    const branding = await resolveBranding(issued.portalUser.agencyId, {
      whiteLabelEnabled: true,
    });
    const message = {
      template: "portal-magic-link" as const,
      data: { magicLinkPath: `/portal/auth?token=${issued.token}` },
    };
    // Rendered eagerly so a template fault fails here, in a request we can
    // trace, rather than silently in the queue.
    renderMessage(message, branding, { appUrl: "", portalUrl: "" });

    await enqueueEmail(emailQueue(), {
      agencyId: issued.portalUser.agencyId,
      message: message as unknown,
      to: issued.portalUser.email,
      userId: null,
      alertRuleId: null,
      notificationType: null,
      entityType: "portal_user",
      entityId: issued.portalUser.id,
      idempotencyKey: `portal-link:${issued.portalUser.id}:${Date.now()}`,
    });

    return noContent;
  } catch (error) {
    // Even an unexpected failure answers 204 — a 500 on a known address and a
    // 204 on an unknown one is the same oracle by another name.
    log.error({ err: error }, "portal magic-link request failed");
    return noContent;
  }
}
