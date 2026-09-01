import { requirePermission } from "@/server/auth/context";
import { getCheckoutConfirmation } from "@/server/services/billing";
import { toAppError } from "@pdm/shared/errors";

/**
 * `GET /api/billing/confirmation` — PLAN.md Part IX §9.1, Phase 6 task 6.3.
 *
 * ⚠️ THIS ENDPOINT IS WHY A FORGED REDIRECT BUYS NOTHING. §9.1: the checkout
 * return "polls our own API until the webhook has updated
 * `Subscription.status`". Anyone can navigate to `/app/billing?checkout=success`
 * — that URL is a query string, not a proof of payment. What it produces is a
 * spinner that polls here, and here reads OUR projection, which only the
 * signature-verified webhook writes.
 *
 * ⚠️ NO `dynamic = "force-dynamic"`. Route Handler `GET` is uncached by default
 * in Next 16 (AGENTS.md); adding it would be cargo cult.
 */
export async function GET(): Promise<Response> {
  try {
    const ctx = await requirePermission("billing:read");
    const confirmation = await getCheckoutConfirmation(ctx);
    return Response.json(confirmation);
  } catch (error) {
    const appError = toAppError(error);
    return Response.json({ error: appError.code }, { status: appError.httpStatus });
  }
}
