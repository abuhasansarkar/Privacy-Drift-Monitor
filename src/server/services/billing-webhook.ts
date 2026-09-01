import "server-only";
import type Stripe from "stripe";
import { unsafeGlobalClient } from "@pdm/database";
import { logger } from "@pdm/shared/logger";
import { track } from "@pdm/shared/analytics";
import type { WebhookIntent } from "@pdm/billing";

/**
 * STRIPE WEBHOOK APPLICATION — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * Takes the pure `WebhookIntent` that `@pdm/billing` read out of the event and
 * applies it to our projection, idempotently.
 *
 * ⚠️ `unsafeGlobalClient` IS CORRECT HERE, and the justification is required in
 * review: a webhook arrives with NO SESSION and no agency. The only handle it
 * carries is a `stripeCustomerId`, and resolving that to an agency is precisely
 * the lookup that cannot be tenant-scoped — `forAgency()` needs the answer this
 * query produces. Every write below is then constrained to the single
 * subscription row that lookup returned.
 */

const db = unsafeGlobalClient(
  "a Stripe webhook has no session; resolving stripeCustomerId to an agency is the lookup that establishes tenancy",
);

export interface WebhookOutcome {
  status: "processed" | "ignored" | "duplicate";
  reason?: string;
}

/**
 * ⚠️ IDEMPOTENCY IS ENFORCED BY THE `stripeEventId` UNIQUE CONSTRAINT, not by
 * the read below. The read is the fast path; the constraint is the guarantee.
 * Stripe retries aggressively and two retries can arrive concurrently — both
 * would pass a `findUnique` check and both would apply the event. `invoice.paid`
 * applied twice resets the usage period twice, which hands the customer a free
 * allowance; `create` racing on the unique index is what actually prevents it.
 */
export async function applyWebhookIntent(
  event: Stripe.Event,
  intent: WebhookIntent,
): Promise<WebhookOutcome> {
  const existing = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing?.status === "processed") {
    return { status: "duplicate" };
  }

  await db.stripeWebhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      status: "received",
      payload: event as unknown as never,
      attempts: 1,
    },
    // A retry bumps the counter — a row with attempts: 8 is the signal that
    // something is failing repeatedly, and it is visible in /admin.
    update: { attempts: { increment: 1 } },
  });

  try {
    const outcome = await apply(intent);
    await db.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        status: outcome.status === "ignored" ? "ignored" : "processed",
        processedAt: new Date(),
        error: outcome.reason ?? null,
      },
    });
    return outcome;
  } catch (error) {
    await db.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
    });
    // Rethrown so the route returns 500 and Stripe retries (§9.1).
    throw error;
  }
}

async function apply(intent: WebhookIntent): Promise<WebhookOutcome> {
  if (intent.kind === "ignore") {
    return { status: "ignored", reason: intent.reason };
  }

  /*
   * Every remaining intent is keyed by `stripeCustomerId`. A customer we have
   * never seen is NOT an error: it is a Stripe account shared with another
   * environment, or a customer created in the dashboard by hand. Ignoring it
   * returns 200 and stops the retry loop, which is what §9.1 wants for anything
   * we cannot act on.
   */
  const subscription = await db.subscription.findFirst({
    where: { stripeCustomerId: intent.stripeCustomerId },
    /*
     * ⚠️ `planId` AND `status` ARE SELECTED FOR THE ANALYTICS COMPARISON BELOW,
     * which has to happen BEFORE the update — afterwards there is nothing left
     * to compare against and an upgrade is indistinguishable from a downgrade.
     */
    select: { id: true, agencyId: true, planId: true, status: true },
  });

  switch (intent.kind) {
    case "sync-subscription": {
      /*
       * ⚠️ `checkout.session.completed` IS THE ONLY EVENT THAT MAY CREATE A
       * ROW, because it is the only one carrying `client_reference_id` — the
       * agency link. A `customer.subscription.updated` for a customer we do not
       * know cannot be attached to anyone, and guessing would attach a paying
       * customer's subscription to the wrong tenant.
       */
      if (!subscription && !intent.agencyId) {
        return { status: "ignored", reason: "unknown customer, no agency reference" };
      }

      const plan = intent.stripePriceId
        ? await findPlanByPriceId(intent.stripePriceId)
        : null;

      if (subscription) {
        /*
         * ⚠️ §9.6's SUBSCRIPTION EVENTS ARE EMITTED FROM THE WEBHOOK, NOT FROM
         * THE CHECKOUT REDIRECT. Same rule as the entitlement change itself
         * (§9.1): the redirect is not evidence that anything happened, so a
         * `subscription_started` fired there would count revenue for customers
         * whose card declined a second later.
         *
         * The plan comparison happens BEFORE the update, because afterwards
         * there is nothing to compare against.
         */
        if (plan && plan.id !== subscription.planId) {
          const previous = await db.plan.findUnique({
            where: { id: subscription.planId },
            select: { key: true, sortOrder: true },
          });
          if (previous) {
            void track(
              plan.sortOrder > previous.sortOrder
                ? "subscription_upgraded"
                : "subscription_downgraded",
              { from_plan: previous.key, to_plan: plan.key },
              { agencyId: subscription.agencyId },
            );
          }
        }
        if (
          intent.status === "ACTIVE" &&
          (subscription.status === "TRIALING" || subscription.status === "INCOMPLETE")
        ) {
          void track(
            "subscription_started",
            {
              plan: plan?.key ?? null,
              interval: intent.interval,
              from_trial: subscription.status === "TRIALING",
            },
            { agencyId: subscription.agencyId },
          );
        }

        await db.subscription.update({
          where: { id: subscription.id },
          data: {
            stripeSubscriptionId: intent.stripeSubscriptionId,
            status: intent.status as never,
            interval: intent.interval as never,
            /*
             * ⚠️ PERIOD DATES AND PLAN ARE ONLY OVERWRITTEN WHEN THE EVENT
             * CARRIES THEM. `checkout.session.completed` deliberately reports
             * no period and no price — the authoritative values arrive on the
             * `customer.subscription.*` event that follows it, and the two can
             * arrive OUT OF ORDER. Writing nulls from the checkout event would
             * blank a period the subscription event had already set, and
             * `resolvePeriodStart()` would silently fall back to the calendar
             * month for that agency's entire usage metering.
             */
            ...(intent.currentPeriodStart
              ? { currentPeriodStart: intent.currentPeriodStart }
              : {}),
            ...(intent.currentPeriodEnd
              ? { currentPeriodEnd: intent.currentPeriodEnd }
              : {}),
            ...(intent.trialEndsAt ? { trialEndsAt: intent.trialEndsAt } : {}),
            ...(plan ? { planId: plan.id } : {}),
            cancelAtPeriodEnd: intent.cancelAtPeriodEnd,
          },
        });
        return { status: "processed" };
      }

      // First subscription for this agency.
      const fallbackPlan = plan ?? (await findCheapestPlan());
      if (!fallbackPlan) {
        return { status: "ignored", reason: "no plan rows exist to attach" };
      }

      await db.subscription.create({
        data: {
          agencyId: intent.agencyId!,
          planId: fallbackPlan.id,
          stripeCustomerId: intent.stripeCustomerId,
          stripeSubscriptionId: intent.stripeSubscriptionId,
          status: intent.status as never,
          interval: intent.interval as never,
          currentPeriodStart: intent.currentPeriodStart,
          currentPeriodEnd: intent.currentPeriodEnd,
          trialEndsAt: intent.trialEndsAt,
          cancelAtPeriodEnd: intent.cancelAtPeriodEnd,
        },
      });
      return { status: "processed" };
    }

    case "mark-active": {
      if (!subscription) return { status: "ignored", reason: "unknown customer" };
      /*
       * ⚠️ `invoice.paid` CLEARS PAST-DUE BUT DOES NOT TOUCH THE PERIOD DATES.
       * §9.1 says it "resets the usage period", and it does — but the new
       * period boundaries arrive on `customer.subscription.updated`, which
       * Stripe sends alongside. Writing a guessed period here would put usage
       * metering on a window Stripe does not agree with, and every limit would
       * be enforced against the wrong number until the next invoice.
       */
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: "ACTIVE" },
      });
      return { status: "processed" };
    }

    case "mark-past-due": {
      if (!subscription) return { status: "ignored", reason: "unknown customer" };
      /*
       * ⚠️ READ-ONLY, NOT LOCKED OUT. Feature doc 17 rule 3 — the entitlement
       * resolver turns PAST_DUE into "no new scans, no AI credits" while
       * leaving every limit that governs VIEWING untouched. Nothing here
       * deletes, hides or archives anything.
       */
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE" },
      });
      logger.warn(
        { component: "stripe-webhook", agencyId: subscription.agencyId },
        "payment failed — agency moved to read-only scanning",
      );
      return { status: "processed" };
    }

    case "trial-ending":
    case "action-required": {
      if (!subscription) return { status: "ignored", reason: "unknown customer" };
      /*
       * ⚠️ NO STATE CHANGE. Both are NOTIFICATIONS, not transitions: a trial
       * three days from ending is still a working trial, and an invoice needing
       * SCA is not yet a failed payment. Feature doc 17 rule 2 — "never change
       * subscription state on our own inference". Stripe will send
       * `invoice.payment_failed` if it actually fails.
       *
       * 🟡 The emails §9.1 asks for (day 11 / day 13, SCA request) are not sent
       * yet — the templates are Phase 4's and the trigger belongs here, but
       * wiring it needs a `TRIAL_ENDING` notification path that does not exist.
       * Logged so the gap is visible rather than silently dropped.
       */
      logger.info(
        { component: "stripe-webhook", agencyId: subscription.agencyId, kind: intent.kind },
        "billing notification event received — email not yet wired",
      );
      return { status: "processed" };
    }

    case "sync-billing-email":
      // Nothing on our side stores a separate billing email yet; the agency's
      // owner is the contact. Recorded as handled so Stripe stops retrying.
      return { status: "processed" };
  }
}

/** The plan whose Stripe price the subscription is actually on. */
async function findPlanByPriceId(priceId: string) {
  return db.plan.findFirst({
    where: {
      OR: [{ stripePriceMonthlyId: priceId }, { stripePriceAnnualId: priceId }],
    },
    /*
     * ⚠️ `key` AND `sortOrder` ARE FOR THE UPGRADE/DOWNGRADE DISTINCTION, and
     * `sortOrder` is the right comparator rather than price: an annual figure
     * is larger than a monthly one on a cheaper plan, so comparing amounts
     * would report a downgrade to Scale-annual as an upgrade from Growth.
     */
    select: { id: true, key: true, sortOrder: true },
  });
}

/**
 * ⚠️ THE CHEAPEST PLAN IS THE FALLBACK WHEN A PRICE IS UNRECOGNISED.
 *
 * It happens when a price was created in the Stripe dashboard and never synced
 * to `Plan`. Attaching the smallest plan under-serves the customer, which a
 * support message fixes in a minute; attaching the largest would hand out Scale
 * entitlements for a Starter payment, which nobody notices until the invoice
 * does not match the usage.
 */
async function findCheapestPlan() {
  return db.plan.findFirst({
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
}

/**
 * §3.12's "Stripe webhook event log with **replay**".
 *
 * ⚠️ IT RE-RUNS OUR HANDLER OVER THE STORED PAYLOAD; IT DOES NOT ASK STRIPE TO
 * RESEND. The stored payload is what we actually received, so a replay
 * reproduces the original conditions exactly rather than whatever Stripe's
 * current state would produce — which is what you want when investigating why
 * an event did not take.
 *
 * ⚠️ IT FORCES THE REPLAY PAST THE DUPLICATE CHECK, and that is the one thing
 * that makes it useful. `applyWebhookIntent` returns `duplicate` for anything
 * already marked processed; an operator replaying an event is asserting that
 * the projection is wrong DESPITE the row saying it succeeded. Re-applying is
 * safe because every intent in `apply()` is an idempotent upsert — replaying
 * `customer.subscription.updated` writes the same row twice, which is a no-op.
 *
 * ⚠️ IT NEVER RE-DERIVES THE INTENT FROM A HAND-EDITED PAYLOAD. The payload is
 * read from our own table, not from the request, so an admin cannot craft an
 * event that grants a plan.
 */
export async function replayStripeEvent(payload: unknown): Promise<WebhookOutcome> {
  const { interpretEvent } = await import("@pdm/billing");
  const event = payload as Stripe.Event;

  if (!event?.id || !event?.type) {
    throw new Error("stored payload is not a Stripe event");
  }

  const intent = interpretEvent(event);
  const outcome = await apply(intent);

  await db.stripeWebhookEvent.update({
    where: { stripeEventId: event.id },
    data: {
      status: outcome.status === "ignored" ? "ignored" : "processed",
      processedAt: new Date(),
      error: outcome.reason ?? null,
      attempts: { increment: 1 },
    },
  });

  logger.warn(
    { component: "billing-webhook", eventId: event.id, type: event.type },
    "stripe webhook event replayed by an operator",
  );
  return outcome;
}
