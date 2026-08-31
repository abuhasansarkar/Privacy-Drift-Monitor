import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { createStripeClient, interpretEvent } from "@pdm/billing";
import { logger } from "@pdm/shared/logger";
import { applyWebhookIntent } from "@/server/services/billing-webhook";

/**
 * `POST /api/webhooks/stripe` — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * ⚠️ **THE ORDER OF OPERATIONS BELOW IS FIXED AND NON-NEGOTIABLE** — §9.1's
 * word, and it prints the sequence as code. Every step exists because skipping
 * it costs money or corrupts billing state:
 *
 *   1. RAW BODY, BEFORE ANY PARSING. `constructEvent` verifies a signature over
 *      the exact bytes Stripe sent. `await req.json()` first and the signature
 *      can never validate again — the object is re-serialised with different
 *      key order and whitespace. This is why the handler reads `req.text()`.
 *   2. VERIFY THE SIGNATURE. Before the body is trusted for anything at all.
 *      Without it, `POST /api/webhooks/stripe` is an unauthenticated endpoint
 *      that grants subscriptions to whoever calls it.
 *   3. IDEMPOTENCY ON `event.id`. Stripe retries, and a replayed
 *      `invoice.paid` must be a no-op, not a second period reset.
 *   4. PROCESS, THEN MARK. A failure returns 500 so Stripe retries; a success
 *      returns 200 so it does not.
 *
 * ⚠️ UNKNOWN EVENT TYPES RETURN **200**. §9.1: "never a 500, which would cause
 * Stripe to retry indefinitely." Stripe sends dozens of types we never
 * subscribed to; a 4xx/5xx on any of them creates an infinite retry loop that
 * eventually gets the endpoint disabled — taking the events we DO care about
 * down with it.
 *
 * ⚠️ IT FAILS CLOSED WITH NO SECRET. `STRIPE_WEBHOOK_SECRET` is currently
 * unset, so every request is rejected — which is correct, and the same posture
 * the Resend delivery webhook already takes. An endpoint that accepted
 * unverified billing events because a variable was missing is the worst
 * possible default.
 */

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = createStripeClient();

  if (!stripe || !secret) {
    // 401, not 500: this is a configuration state, not a fault, and Stripe
    // should not retry into an endpoint that cannot verify anything.
    logger.warn(
      { component: "stripe-webhook" },
      "stripe webhook received but STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is unset",
    );
    return new Response("Webhook not configured", { status: 401 });
  }

  // 1. The raw bytes. Never `req.json()` — see the header.
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // 2. Verify before trusting anything in the payload.
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    /*
     * ⚠️ 400, AND THE REASON NEVER REACHES THE CALLER. A verification failure
     * is either a misconfigured secret or someone probing the endpoint;
     * describing which check failed hands a prober an oracle, exactly as §10.3
     * reasons about the SSRF guard's deliberately vague message.
     */
    logger.warn(
      { component: "stripe-webhook", err: error },
      "stripe webhook signature verification failed",
    );
    return new Response("Invalid signature", { status: 400 });
  }

  const log = logger.child({ component: "stripe-webhook", stripeEventId: event.id });

  try {
    // 3 + 4. Idempotency and processing live together in the service, because
    // "have we already done this?" and "do it" must not race each other.
    const outcome = await applyWebhookIntent(event, interpretEvent(event));

    log.info({ type: event.type, outcome: outcome.status }, "stripe webhook handled");
    return new Response("OK", { status: 200 });
  } catch (error) {
    /*
     * ⚠️ 500 IS DELIBERATE HERE, AND IT IS THE ONLY PLACE IT IS. §9.1: a
     * processing failure returns 500 "so Stripe retries". This is the one
     * failure we WANT retried — the event is valid and we could not apply it,
     * which is usually a transient database problem. The attempt is already
     * recorded on `StripeWebhookEvent`, so the retry is idempotent.
     */
    log.error({ err: error, type: event.type }, "stripe webhook processing failed");
    return new Response("Processing failed", { status: 500 });
  }
}
