import type { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { createPortalSession } from "@/server/services/billing";
import { toAppError } from "@pdm/shared/errors";
import { logger } from "@pdm/shared/logger";

/**
 * `POST /api/billing/portal` — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * ⚠️ EVERY DOWNGRADE, CANCELLATION, PAYMENT-METHOD CHANGE AND INVOICE DOWNLOAD
 * HAPPENS BEHIND THIS ONE CALL. §9.1: "We do not rebuild those flows." Stripe's
 * portal handles proration, tax, dunning, invoice PDFs and SCA — each of which
 * is a compliance surface that would be ours to maintain and get wrong quietly.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ctx = await requirePermission("billing:manage");
    const origin = new URL(req.url).origin;
    const { url } = await createPortalSession(ctx, `${origin}/app/billing`);
    return Response.json({ url });
  } catch (error) {
    const appError = toAppError(error);
    logger.warn(
      { component: "billing-portal", code: appError.code, reason: appError.reason },
      "portal session could not be created",
    );
    return Response.json(
      { error: appError.code, message: appError.expose ? appError.message : undefined },
      { status: appError.httpStatus },
    );
  }
}
