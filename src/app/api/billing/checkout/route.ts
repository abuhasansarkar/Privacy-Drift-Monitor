import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/context";
import { createCheckoutSession } from "@/server/services/billing";
import { toAppError } from "@pdm/shared/errors";
import { logger } from "@pdm/shared/logger";

/**
 * `POST /api/billing/checkout` — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * ⚠️ A ROUTE HANDLER RATHER THAN A SERVER ACTION, deliberately. It returns a
 * Stripe-hosted URL the browser must navigate to, and a Server Action's
 * response is consumed by React — the redirect would have to be re-issued
 * client-side anyway. A route also lets the billing page use plain `fetch` with
 * a loading state it controls.
 *
 * ⚠️ `billing:manage` IS OWNER/ADMIN ONLY (§6.1). Anyone who can start a
 * checkout can change what the agency pays.
 */
const schema = z.object({
  planKey: z.string().min(1).max(40),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
  // Unsupported currencies fall back to USD in `resolvePriceId` (§9.3 bills in
  // USD); this only has to reject something unparseable.
  currency: z.string().min(3).max(3).default("usd"),
});

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ctx = await requirePermission("billing:manage");

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const { url } = await createCheckoutSession(ctx, {
      ...parsed.data,
      returnUrl: `${origin}/app/billing`,
    });

    return Response.json({ url });
  } catch (error) {
    const appError = toAppError(error);
    logger.warn(
      { component: "billing-checkout", code: appError.code, reason: appError.reason },
      "checkout session could not be created",
    );
    return Response.json(
      // ⚠️ `reason` is log-only — it names plan keys and agency ids.
      { error: appError.code, message: appError.expose ? appError.message : undefined },
      { status: appError.httpStatus },
    );
  }
}
