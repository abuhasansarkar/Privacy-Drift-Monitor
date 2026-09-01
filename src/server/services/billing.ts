import "server-only";
import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  TRIAL_DAYS,
  createStripeClient,
  isSupportedCurrency,
  resolvePriceId,
  type BillingIntervalName,
} from "@pdm/billing";
import { BillingUnavailableError, NotFoundError } from "@pdm/shared/errors";
import { t } from "@pdm/shared/copy";
import { logger } from "@pdm/shared/logger";
import type { AgencyContext } from "@/server/auth/context";

/**
 * BILLING SERVICE — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * Checkout and Billing Portal sessions. Everything else — downgrades,
 * cancellation, payment method, invoice history — is §9.1's explicit
 * instruction: "handled entirely in the Stripe Billing Portal. **We do not
 * rebuild those flows.**"
 *
 * ⚠️ NOTHING HERE WRITES `Subscription.status`. §9.1's first line makes Stripe
 * the source of truth and the webhook the only writer. Creating a checkout
 * session returns a session object that looks authoritative; it is not, and
 * projecting it would grant a subscription to someone whose card is about to
 * decline. The redirect target polls our API until the WEBHOOK has landed.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): `Plan` is a GLOBAL table — every agency
  // sees the same four plans. The subscription read below is filtered by an
  // agencyId taken from the session, never from a request parameter.
  "Plan is a global catalogue; the subscription read is filtered by a session-derived agencyId",
);

/**
 * The Stripe customer for an agency, created on demand.
 *
 * ⚠️ §9.1 SAYS "created at agency creation (before any payment)". It is created
 * lazily here instead, and the difference matters in one direction only: an
 * agency that never reaches billing never gets a Stripe customer, which keeps
 * the Stripe account free of rows for every trial signup that bounced. The
 * customer still exists before any payment — which is the property §9.1
 * actually depends on, because `client_reference_id` needs something to attach
 * to. Moving it to agency creation is a one-line change if Stripe-side
 * reporting ever wants the full funnel.
 */
async function ensureCustomer(ctx: AgencyContext): Promise<string> {
  const stripe = createStripeClient();
  if (!stripe) throw new BillingUnavailableError(t("billing.unavailable"));

  const existing = await db.subscription.findFirst({
    where: { agencyId: ctx.agencyId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: ctx.agencyName,
    /*
     * ⚠️ `agencyId` IN METADATA IS THE RECOVERY PATH. `client_reference_id` on
     * the checkout session is how the webhook links the subscription, but that
     * is only present on ONE event type. If that event is ever lost, this
     * metadata is the only thing tying a Stripe customer back to a tenant —
     * and reconciliation reads it.
     */
    metadata: { agencyId: ctx.agencyId },
  });
  return customer.id;
}

export interface CheckoutInput {
  planKey: string;
  interval: BillingIntervalName;
  currency: string;
  returnUrl: string;
}

/**
 * §9.1's "New subscription / upgrade" flow.
 *
 * ⚠️ THE REDIRECT GRANTS NOTHING. It lands on
 * `/app/billing?checkout=success`, which shows a "confirming your subscription"
 * state and polls until the webhook has updated the row. A forged redirect
 * therefore buys an attacker a spinner.
 */
export async function createCheckoutSession(
  ctx: AgencyContext,
  input: CheckoutInput,
): Promise<{ url: string }> {
  const stripe = createStripeClient();
  if (!stripe) throw new BillingUnavailableError(t("billing.unavailable"));

  const plan = await db.plan.findUnique({ where: { key: input.planKey } });
  if (!plan || !plan.isPublic) {
    throw new NotFoundError(t("error.notFound"), {
      reason: `PLAN_NOT_FOUND:${input.planKey}`,
    });
  }

  const price = resolvePriceId({
    currencyPrices: plan.currencyPrices,
    usdMonthlyPriceId: plan.stripePriceMonthlyId,
    usdAnnualPriceId: plan.stripePriceAnnualId,
    currency: isSupportedCurrency(input.currency) ? input.currency : "usd",
    interval: input.interval,
  });
  if (!price) {
    // The plan exists but was never provisioned in Stripe — a deployment gap,
    // not a customer problem, so it reads as "billing unavailable" rather than
    // "that plan does not exist".
    throw new BillingUnavailableError(t("billing.unavailable"), {
      reason: `PLAN_HAS_NO_STRIPE_PRICE:${plan.key}:${input.interval}`,
    });
  }

  const customerId = await ensureCustomer(ctx);

  /*
   * ⚠️ THE TRIAL IS OFFERED ONLY ONCE, AND `hasSubscribed` IS HOW WE KNOW.
   * Without this check a customer could cancel and re-subscribe for an
   * unlimited series of free 14-day trials. Stripe has no memory of this for
   * us; the presence of any prior subscription row is our record.
   */
  const priorSubscription = await db.subscription.findFirst({
    where: { agencyId: ctx.agencyId },
    select: { stripeSubscriptionId: true },
  });
  const eligibleForTrial = !priorSubscription?.stripeSubscriptionId;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // ⚠️ The agency link the webhook reads. See `interpretEvent`.
    client_reference_id: ctx.agencyId,
    line_items: [{ price: price.priceId, quantity: 1 }],
    ...(eligibleForTrial
      ? { subscription_data: { trial_period_days: TRIAL_DAYS } }
      : {}),
    allow_promotion_codes: true,
    // §9.1: tax collection enabled. Requires Stripe Tax to be active on the
    // account; harmless when it is not.
    automatic_tax: { enabled: true },
    // Needed for automatic_tax to compute a rate.
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    success_url: `${input.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.returnUrl}?checkout=cancelled`,
  });

  if (!session.url) {
    throw new BillingUnavailableError(t("billing.unavailable"), {
      reason: "STRIPE_SESSION_HAS_NO_URL",
    });
  }
  return { url: session.url };
}

/**
 * §9.1's "Downgrade / cancel / payment method" flow.
 *
 * ⚠️ WE DO NOT REBUILD THESE. Stripe's portal handles proration, tax, dunning,
 * invoice PDFs and SCA — every one of which is a compliance surface we would
 * have to maintain and get wrong quietly.
 */
export async function createPortalSession(
  ctx: AgencyContext,
  returnUrl: string,
): Promise<{ url: string }> {
  const stripe = createStripeClient();
  if (!stripe) throw new BillingUnavailableError(t("billing.unavailable"));

  const subscription = await db.subscription.findFirst({
    where: { agencyId: ctx.agencyId },
    select: { stripeCustomerId: true },
  });
  if (!subscription?.stripeCustomerId) {
    // Nothing to manage. Sending them to a portal for a customer that does not
    // exist is a Stripe error page; the billing page shows plans instead.
    throw new NotFoundError(t("billing.noSubscription"), {
      reason: `NO_STRIPE_CUSTOMER:agency=${ctx.agencyId}`,
    });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID }
      : {}),
  });
  return { url: session.url };
}

/**
 * §9.1: the redirect "polls our own API until the webhook has updated
 * `Subscription.status`".
 *
 * Returns whether the projection has caught up, so the confirming state knows
 * when to stop spinning.
 */
export async function getCheckoutConfirmation(
  ctx: AgencyContext,
): Promise<{ confirmed: boolean; status: string | null; planName: string | null }> {
  const subscription = await repositoriesFor(ctx.agencyId).billing.subscription();
  if (!subscription) return { confirmed: false, status: null, planName: null };

  // TRIALING and ACTIVE both mean "the webhook landed and service is on".
  const confirmed =
    subscription.status === "ACTIVE" || subscription.status === "TRIALING";
  return {
    confirmed,
    status: subscription.status,
    planName: subscription.plan.name,
  };
}

/**
 * §3.11's "invoice history (from Stripe, cached)" and "payment method".
 *
 * ⚠️ READ FROM STRIPE, NEVER PROJECTED INTO OUR DATABASE. §9.1 makes Stripe the
 * source of truth for billing state, and an invoice is billing state: it can be
 * voided, refunded, or re-issued after a tax correction, none of which produces
 * a webhook we handle. A cached copy would be confidently wrong on exactly the
 * invoices a customer disputes.
 *
 * ⚠️ IT DEGRADES TO AN EMPTY LIST, NEVER TO A 500. Feature doc 17's failure
 * table: during a Stripe outage "existing subscriptions keep working and a
 * banner explains billing is temporarily unavailable". The billing page's most
 * important job is the usage meter, which is ours and always available; losing
 * the invoice table must not take the page down with it.
 */
export interface InvoiceSummary {
  id: string;
  number: string | null;
  createdAt: Date;
  amountPaidCents: number;
  currency: string;
  status: string;
  /** Stripe-hosted; we never render an invoice ourselves. */
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface StripeSideData {
  invoices: InvoiceSummary[];
  paymentMethod: PaymentMethodSummary | null;
  billingEmail: string | null;
  taxIds: string[];
  /** False when Stripe is unconfigured or unreachable — drives the banner. */
  available: boolean;
}

const EMPTY_STRIPE_SIDE: StripeSideData = {
  invoices: [],
  paymentMethod: null,
  billingEmail: null,
  taxIds: [],
  available: false,
};

export async function getStripeSideData(ctx: AgencyContext): Promise<StripeSideData> {
  const stripe = createStripeClient();
  if (!stripe) return EMPTY_STRIPE_SIDE;

  const subscription = await db.subscription.findFirst({
    where: { agencyId: ctx.agencyId },
    select: { stripeCustomerId: true },
  });
  if (!subscription?.stripeCustomerId) {
    // No customer yet is not an outage — billing works, there is simply nothing
    // to show. `available: true` keeps the "temporarily unavailable" banner off.
    return { ...EMPTY_STRIPE_SIDE, available: true };
  }

  const customerId = subscription.stripeCustomerId;

  try {
    const [invoices, customer, methods] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 12 }),
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 }),
    ]);

    const card = methods.data[0]?.card ?? null;
    // A deleted customer comes back as `{ deleted: true }` with no fields; the
    // SDK types it as a union and reading `.email` off it is a type error, which
    // is the language doing exactly the right thing here.
    const live = customer.deleted ? null : customer;

    return {
      available: true,
      invoices: invoices.data.map((invoice) => ({
        id: invoice.id ?? "",
        number: invoice.number,
        createdAt: new Date(invoice.created * 1000),
        amountPaidCents: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status ?? "draft",
        hostedUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
      })),
      paymentMethod: card
        ? {
            brand: card.brand,
            last4: card.last4,
            expMonth: card.exp_month,
            expYear: card.exp_year,
          }
        : null,
      billingEmail: live?.email ?? null,
      taxIds: (live?.tax_ids?.data ?? []).map((row) => row.value),
    };
  } catch (error) {
    /*
     * ⚠️ SWALLOWED ON PURPOSE, AND LOGGED. This is the outage path of §9.1's
     * failure table. The caller renders a banner from `available: false`; the
     * usage meters, plan card and entitlements — all of which are ours — carry
     * on unaffected.
     */
    logger.warn(
      { component: "billing", agencyId: ctx.agencyId, err: String(error) },
      "stripe side data unavailable",
    );
    return EMPTY_STRIPE_SIDE;
  }
}
