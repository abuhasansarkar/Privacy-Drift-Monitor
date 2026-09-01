import Stripe from "stripe";

/**
 * STRIPE CLIENT — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * ⚠️ **STRIPE IS THE SOURCE OF TRUTH FOR BILLING STATE.** §9.1, first line. Our
 * `Subscription` table is a PROJECTION of Stripe, "updated exclusively by
 * webhooks. We never infer subscription status from a successful API call or
 * from the checkout redirect — only from a webhook."
 *
 * That sentence is the single most important constraint in this package, and it
 * is easy to break by accident: `stripe.subscriptions.create()` returns a
 * subscription object, and writing its status to our table right there feels
 * obviously correct. It is not. The API response and the webhook can disagree
 * (a 3-D Secure challenge, a card that declines a moment later), and the one
 * that reflects what actually happened is the webhook. Nothing in this file
 * writes to our database — it only talks to Stripe.
 *
 * ⚠️ NOTHING OUTSIDE `packages/billing` IMPORTS THE STRIPE SDK. Same rule
 * §8.3 sets for the AI provider, for the same reason: a vendor SDK spread
 * across route handlers is a vendor migration that touches thirty files.
 */

/**
 * ⚠️ RETURNS `null` RATHER THAN THROWING when no key is configured.
 *
 * §9.1's failure table: during a Stripe outage "existing subscriptions keep
 * working and a banner explains billing is temporarily unavailable". An
 * unconfigured key is the same product state as an outage — checkout and portal
 * are unavailable, everything already granted keeps working — so it must not be
 * a 500 on a page that merely renders a usage meter.
 */
export function createStripeClient(
  apiKey: string | undefined = process.env.STRIPE_SECRET_KEY,
): Stripe | null {
  if (!apiKey) return null;
  return new Stripe(apiKey, {
    /*
     * ⚠️ THE API VERSION IS PINNED, DELIBERATELY. Stripe rolls breaking changes
     * behind dated versions; letting the account default apply means a change
     * made in the Stripe dashboard by someone else silently reshapes the
     * webhook payloads this code parses. Upgrading is then a deliberate edit
     * here plus a re-read of their changelog — which is the point.
     */
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
    // Two attempts, short timeout: a checkout click is a person waiting.
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Privacy Drift Monitor" },
  });
}

export function isStripeConfigured(
  apiKey: string | undefined = process.env.STRIPE_SECRET_KEY,
): boolean {
  return Boolean(apiKey);
}

/** §9.3: billing in USD, with GBP and EUR as localized Prices. */
export const SUPPORTED_CURRENCIES = ["usd", "gbp", "eur"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toLowerCase());
}

export type BillingIntervalName = "MONTHLY" | "ANNUAL";

/**
 * The localized price map stored on `Plan.currencyPrices` (§9.1).
 *
 * Shape: `{ gbp: { monthly: "price_…", annual: "price_…" }, … }`
 */
export type CurrencyPriceMap = Partial<
  Record<SupportedCurrency, { monthly?: string; annual?: string }>
>;

/**
 * Picks the Stripe Price id for a plan, currency and interval.
 *
 * ⚠️ IT FALLS BACK TO USD RATHER THAN FAILING, and that is a deliberate
 * commercial choice: §9.3 bills in USD and offers GBP/EUR as a convenience. A
 * customer who asks for a currency we have not provisioned should be charged in
 * USD — annoying but correct — rather than shown an error that loses the sale.
 *
 * ⚠️ READ DEFENSIVELY BECAUSE `currencyPrices` IS AN UNVALIDATED JSON COLUMN.
 * A hand-edited row with a number where a price id belongs must degrade to the
 * USD fallback, not be handed to Stripe as `price: 42` — which fails at
 * checkout, in front of a customer, with a Stripe error message.
 */
export function resolvePriceId(input: {
  currencyPrices: unknown;
  usdMonthlyPriceId: string | null;
  usdAnnualPriceId: string | null;
  currency: string;
  interval: BillingIntervalName;
}): { priceId: string; currency: SupportedCurrency } | null {
  const key = input.interval === "ANNUAL" ? "annual" : "monthly";
  const requested = input.currency.toLowerCase();

  if (requested !== "usd" && isSupportedCurrency(requested)) {
    const map = readCurrencyPrices(input.currencyPrices);
    const localized = map[requested]?.[key];
    if (localized) return { priceId: localized, currency: requested };
  }

  const usd = key === "annual" ? input.usdAnnualPriceId : input.usdMonthlyPriceId;
  return usd ? { priceId: usd, currency: "usd" } : null;
}

export function readCurrencyPrices(value: unknown): CurrencyPriceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: CurrencyPriceMap = {};
  for (const [currency, prices] of Object.entries(value as Record<string, unknown>)) {
    const lower = currency.toLowerCase();
    if (!isSupportedCurrency(lower)) continue;
    if (!prices || typeof prices !== "object") continue;

    const record = prices as Record<string, unknown>;
    const entry: { monthly?: string; annual?: string } = {};
    // A Stripe Price id always starts `price_`; anything else is a hand-edit or
    // a product id pasted into the wrong field, and handing either to checkout
    // fails in front of a customer.
    if (typeof record.monthly === "string" && record.monthly.startsWith("price_")) {
      entry.monthly = record.monthly;
    }
    if (typeof record.annual === "string" && record.annual.startsWith("price_")) {
      entry.annual = record.annual;
    }
    if (entry.monthly || entry.annual) out[lower] = entry;
  }
  return out;
}

/**
 * §9.1: "Trial — 14 days, no card required."
 *
 * ⚠️ §12.8 #19 flags the NUMBER as an assumption to validate: "14 days is the
 * right trial length for a product whose value needs TWO SCANS to demonstrate
 * drift. If activation clusters late, extend to 21." A weekly-scanning site
 * produces its second scan on day 7, so 14 leaves one week to react — which is
 * the whole argument, and the reason this is a named constant rather than a
 * literal buried in a checkout call.
 */
export const TRIAL_DAYS = 14;

/** Maps a Stripe subscription status onto ours (§9.1's projection). */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "PAUSED";
    default:
      /*
       * ⚠️ AN UNKNOWN STATUS BECOMES `PAST_DUE`, NOT `ACTIVE`.
       *
       * Stripe can add statuses; our enum cannot know them. Defaulting to
       * ACTIVE would hand full service to an account in a state we do not
       * understand — the failure that costs money. `PAST_DUE` is read-only,
       * which under feature doc 17's rule 3 means the customer keeps every
       * piece of data and only stops consuming metered resources. Wrong in that
       * direction is recoverable by a support message; wrong the other way is
       * not recoverable at all.
       */
      return "PAST_DUE";
  }
}

export function mapStripeInterval(interval: string | undefined): BillingIntervalName {
  return interval === "year" ? "ANNUAL" : "MONTHLY";
}

/** Unix seconds → Date, tolerating the nulls Stripe uses for absent dates. */
export function fromUnix(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export type { Stripe };
