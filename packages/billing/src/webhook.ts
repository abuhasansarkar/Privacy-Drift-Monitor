import type Stripe from "stripe";
import { fromUnix, mapStripeInterval, mapStripeStatus } from "./stripe";

/**
 * STRIPE WEBHOOK EVENT INTERPRETATION — PLAN.md Part IX §9.1,
 * Phase 6 task 6.1.
 *
 * ⚠️ **THE WEBHOOK DRIVES ENTITLEMENTS, NOT THE CHECKOUT REDIRECT.** Feature
 * doc 17's rule 1, and §9.1's opening line: our `Subscription` row is a
 * PROJECTION of Stripe. "A user who closes the tab still gets what they paid
 * for; a forged redirect grants nothing." Both halves matter — the first is a
 * support problem, the second is a free-subscription exploit.
 *
 * ⚠️ THIS FILE IS PURE. It turns a Stripe event into a described INTENT; the
 * route applies it. That split is what lets every event type be tested from a
 * fixture with no database and no Stripe account — which matters because the
 * events that are hardest to reproduce (a failed payment, an SCA challenge) are
 * exactly the ones whose handling is most expensive to get wrong.
 */

/** What the route should do with an event. */
export type WebhookIntent =
  | {
      kind: "sync-subscription";
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      stripePriceId: string | null;
      status: string;
      interval: "MONTHLY" | "ANNUAL";
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      trialEndsAt: Date | null;
      cancelAtPeriodEnd: boolean;
      /** Present on `checkout.session.completed` — links the row to an agency. */
      agencyId: string | null;
    }
  | { kind: "mark-past-due"; stripeCustomerId: string; invoiceUrl: string | null }
  | { kind: "mark-active"; stripeCustomerId: string }
  | { kind: "trial-ending"; stripeCustomerId: string; trialEndsAt: Date | null }
  | { kind: "action-required"; stripeCustomerId: string; invoiceUrl: string | null }
  | { kind: "sync-billing-email"; stripeCustomerId: string; email: string | null }
  /**
   * ⚠️ `ignore` IS A SUCCESS, NOT A FAILURE. §9.1: "Unknown event types are
   * recorded with `status: 'ignored'` and return 200 — never a 500, which would
   * cause Stripe to retry indefinitely." Stripe sends dozens of event types we
   * never subscribed to; a 4xx or 5xx on any of them puts that event into an
   * infinite retry loop that eventually disables the endpoint.
   */
  | { kind: "ignore"; reason: string };

/** The event types §9.1's table handles. Everything else is `ignore`. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.updated",
] as const;

export function isHandledEventType(type: string): boolean {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Reads a Stripe event into an intent.
 *
 * ⚠️ IT NEVER THROWS. A throw here would become a 500, and a 500 tells Stripe
 * to retry — forever, for an event we simply could not read. A malformed or
 * unexpected payload is `ignore`d with a reason, which is recorded and visible
 * in `/admin` rather than hammering the endpoint.
 */
export function interpretEvent(event: Stripe.Event): WebhookIntent {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = idOf(session.customer);
        const subscriptionId = idOf(session.subscription);

        // A one-off payment or a setup session carries no subscription — not
        // our flow, and nothing to project.
        if (!customerId || !subscriptionId) {
          return { kind: "ignore", reason: "checkout session has no subscription" };
        }

        /*
         * ⚠️ `client_reference_id` IS THE AGENCY LINK, and it is the ONLY point
         * where a Stripe customer becomes one of ours. §9.1 sets it when the
         * session is created. Trusting it is safe precisely because it arrives
         * inside a SIGNATURE-VERIFIED event — the same value in a redirect
         * query string would be forgeable, which is why the redirect grants
         * nothing.
         */
        return {
          kind: "sync-subscription",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: null,
          // Deliberately not read from the session: the authoritative status
          // arrives on the `customer.subscription.*` event that follows.
          status: "INCOMPLETE",
          interval: "MONTHLY",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          agencyId: session.client_reference_id ?? null,
        };
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = idOf(sub.customer);
        if (!customerId) return { kind: "ignore", reason: "subscription has no customer" };

        const item = sub.items?.data?.[0];
        /*
         * ⚠️ `.deleted` FORCES `CANCELED` RATHER THAN READING THE STATUS.
         * Stripe sends the final subscription object on deletion and its
         * `status` is usually already `canceled` — but "usually" is not a
         * guarantee, and a deletion event that projected `active` would leave a
         * cancelled customer with a working subscription indefinitely.
         */
        const status =
          event.type === "customer.subscription.deleted"
            ? "CANCELED"
            : mapStripeStatus(sub.status);

        return {
          kind: "sync-subscription",
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          stripePriceId: item?.price?.id ?? null,
          status,
          interval: mapStripeInterval(item?.price?.recurring?.interval),
          currentPeriodStart: fromUnix(periodStart(sub, item)),
          currentPeriodEnd: fromUnix(periodEnd(sub, item)),
          trialEndsAt: fromUnix(sub.trial_end),
          cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          agencyId: null,
        };
      }

      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = idOf(sub.customer);
        if (!customerId) return { kind: "ignore", reason: "trial event has no customer" };
        // §9.1: reminder emails at day 11 and day 13. Stripe fires this three
        // days out; the day-13 nudge is ours to schedule.
        return {
          kind: "trial-ending",
          stripeCustomerId: customerId,
          trialEndsAt: fromUnix(sub.trial_end),
        };
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = idOf(invoice.customer);
        if (!customerId) return { kind: "ignore", reason: "invoice has no customer" };
        return { kind: "mark-active", stripeCustomerId: customerId };
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = idOf(invoice.customer);
        if (!customerId) return { kind: "ignore", reason: "invoice has no customer" };
        return {
          kind: "mark-past-due",
          stripeCustomerId: customerId,
          invoiceUrl: invoice.hosted_invoice_url ?? null,
        };
      }

      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = idOf(invoice.customer);
        if (!customerId) return { kind: "ignore", reason: "invoice has no customer" };
        return {
          kind: "action-required",
          stripeCustomerId: customerId,
          invoiceUrl: invoice.hosted_invoice_url ?? null,
        };
      }

      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        return {
          kind: "sync-billing-email",
          stripeCustomerId: customer.id,
          email: customer.email ?? null,
        };
      }

      default:
        return { kind: "ignore", reason: `unhandled type: ${event.type}` };
    }
  } catch (error) {
    return {
      kind: "ignore",
      reason: `could not read event: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}

/** Stripe fields are `string | { id } | null` depending on expansion. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}

/*
 * ⚠️ THE PERIOD MOVED FROM THE SUBSCRIPTION TO THE ITEM.
 *
 * Stripe relocated `current_period_start/end` onto subscription ITEMS in a
 * 2025 API version. Reading only the subscription silently yields `undefined`
 * on newer versions — and a null period start makes `resolvePeriodStart()` fall
 * back to the calendar month, so every usage limit would quietly meter against
 * the wrong window while looking entirely correct. Both locations are read, item
 * first, so the code survives the version pin being moved either way.
 */
function periodStart(
  sub: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
): number | null | undefined {
  return (
    (item as unknown as { current_period_start?: number })?.current_period_start ??
    (sub as unknown as { current_period_start?: number }).current_period_start
  );
}

function periodEnd(
  sub: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
): number | null | undefined {
  return (
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end
  );
}
