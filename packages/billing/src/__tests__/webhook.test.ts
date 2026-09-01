import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { HANDLED_EVENT_TYPES, interpretEvent, isHandledEventType } from "../webhook";
import { mapStripeStatus, readCurrencyPrices, resolvePriceId } from "../stripe";

/**
 * STRIPE WEBHOOK INTERPRETATION — PLAN.md Part IX §9.1.
 *
 * ⚠️ THESE EVENTS ARE THE ONES HARDEST TO REPRODUCE AND MOST EXPENSIVE TO GET
 * WRONG. A failed payment, an SCA challenge, an out-of-order delivery — none of
 * them can be triggered on demand against a test account, and each one decides
 * whether a paying customer keeps their service or a non-paying one keeps
 * spending our money. Interpretation is a pure function precisely so it can be
 * tested from fixtures.
 */

function event<T>(type: string, object: T): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const SUB = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  trial_end: null,
  items: {
    data: [
      {
        price: { id: "price_growth_monthly", recurring: { interval: "month" } },
        current_period_start: 1_760_000_000,
        current_period_end: 1_762_600_000,
      },
    ],
  },
};

describe("the event allow-list", () => {
  it("covers every type in §9.1's table", () => {
    for (const type of [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.trial_will_end",
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.payment_action_required",
      "customer.updated",
    ]) {
      expect(isHandledEventType(type), type).toBe(true);
    }
    expect(HANDLED_EVENT_TYPES).toHaveLength(9);
  });

  it("⚠️ an UNKNOWN type is IGNORED, never an error", () => {
    /*
     * §9.1: "Unknown event types are recorded with `status: 'ignored'` and
     * return 200 — never a 500, which would cause Stripe to retry
     * indefinitely." Stripe sends dozens of types nobody subscribed to; a
     * non-2xx on any of them is an infinite retry loop that eventually gets the
     * whole endpoint disabled — taking the events we DO care about with it.
     */
    const intent = interpretEvent(event("radar.early_fraud_warning.created", {}));
    expect(intent.kind).toBe("ignore");
  });
});

describe("checkout.session.completed", () => {
  it("carries the agency link from client_reference_id", () => {
    const intent = interpretEvent(
      event("checkout.session.completed", {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "agency-42",
      }),
    );
    expect(intent).toMatchObject({
      kind: "sync-subscription",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      agencyId: "agency-42",
    });
  });

  it("⚠️ reports NO period and NO price, so a later event cannot be overwritten", () => {
    /*
     * The checkout event and `customer.subscription.created` can arrive OUT OF
     * ORDER. If checkout claimed a period, and it landed second, it would blank
     * the real period — and `resolvePeriodStart()` would silently fall back to
     * the calendar month, metering that agency's entire usage against the wrong
     * window while looking completely correct.
     */
    const intent = interpretEvent(
      event("checkout.session.completed", {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "a",
      }),
    );
    if (intent.kind !== "sync-subscription") throw new Error("wrong kind");
    expect(intent.currentPeriodStart).toBeNull();
    expect(intent.currentPeriodEnd).toBeNull();
    expect(intent.stripePriceId).toBeNull();
  });

  it("ignores a session with no subscription — a one-off payment is not our flow", () => {
    const intent = interpretEvent(
      event("checkout.session.completed", { customer: "cus_1", subscription: null }),
    );
    expect(intent.kind).toBe("ignore");
  });

  it("handles expanded objects as well as bare ids", () => {
    // Stripe returns `string | { id }` depending on expansion; reading only one
    // shape drops the customer link on a configuration nobody chose.
    const intent = interpretEvent(
      event("checkout.session.completed", {
        customer: { id: "cus_9" },
        subscription: { id: "sub_9" },
        client_reference_id: "a",
      }),
    );
    expect(intent).toMatchObject({ stripeCustomerId: "cus_9", stripeSubscriptionId: "sub_9" });
  });
});

describe("customer.subscription.*", () => {
  it("projects status, interval and period from the item", () => {
    const intent = interpretEvent(event("customer.subscription.updated", SUB));
    expect(intent).toMatchObject({
      kind: "sync-subscription",
      status: "ACTIVE",
      interval: "MONTHLY",
      stripePriceId: "price_growth_monthly",
    });
    if (intent.kind !== "sync-subscription") return;
    // Asserted as the epoch conversion, not a hand-typed ISO string: the point
    // is that Stripe's UNIX SECONDS become milliseconds, and a transcribed
    // timestamp tests my arithmetic rather than the code's.
    expect(intent.currentPeriodStart?.getTime()).toBe(1_760_000_000 * 1000);
    expect(intent.currentPeriodEnd?.getTime()).toBe(1_762_600_000 * 1000);
  });

  it("⚠️ reads the period from the ITEM, where Stripe moved it", () => {
    /*
     * Stripe relocated `current_period_start/end` onto subscription ITEMS in a
     * 2025 API version. Reading only the subscription yields `undefined` on
     * newer versions — and a null period start makes usage meter against the
     * calendar month instead of the billing period, silently.
     */
    const intent = interpretEvent(event("customer.subscription.updated", SUB));
    if (intent.kind !== "sync-subscription") return;
    expect(intent.currentPeriodStart).not.toBeNull();
  });

  it("falls back to the subscription-level period on older shapes", () => {
    const legacy = {
      ...SUB,
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_600_000,
      items: { data: [{ price: { id: "p", recurring: { interval: "month" } } }] },
    };
    const intent = interpretEvent(event("customer.subscription.updated", legacy));
    if (intent.kind !== "sync-subscription") return;
    expect(intent.currentPeriodStart?.getTime()).toBe(1_700_000_000_000);
  });

  it("reads an annual interval", () => {
    const annual = {
      ...SUB,
      items: { data: [{ price: { id: "p", recurring: { interval: "year" } } }] },
    };
    const intent = interpretEvent(event("customer.subscription.updated", annual));
    expect(intent).toMatchObject({ interval: "ANNUAL" });
  });

  it("⚠️ `.deleted` FORCES CANCELED, whatever status the payload carries", () => {
    /*
     * Stripe sends the final object on deletion and its status is USUALLY
     * already `canceled` — but "usually" is not a guarantee, and a deletion
     * event that projected `active` would leave a cancelled customer with a
     * working subscription indefinitely.
     */
    const intent = interpretEvent(
      event("customer.subscription.deleted", { ...SUB, status: "active" }),
    );
    expect(intent).toMatchObject({ status: "CANCELED" });
  });

  it("carries cancelAtPeriodEnd", () => {
    const intent = interpretEvent(
      event("customer.subscription.updated", { ...SUB, cancel_at_period_end: true }),
    );
    expect(intent).toMatchObject({ cancelAtPeriodEnd: true });
  });

  it("never invents an agency link", () => {
    // Only `checkout.session.completed` carries one. Guessing here would attach
    // a paying customer's subscription to the wrong tenant.
    const intent = interpretEvent(event("customer.subscription.updated", SUB));
    expect(intent).toMatchObject({ agencyId: null });
  });
});

describe("invoice events", () => {
  it("invoice.paid marks active", () => {
    expect(interpretEvent(event("invoice.paid", { customer: "cus_1" }))).toMatchObject({
      kind: "mark-active",
    });
  });

  it("invoice.payment_failed marks past-due and keeps the invoice link", () => {
    const intent = interpretEvent(
      event("invoice.payment_failed", {
        customer: "cus_1",
        hosted_invoice_url: "https://invoice.stripe.com/x",
      }),
    );
    expect(intent).toMatchObject({
      kind: "mark-past-due",
      invoiceUrl: "https://invoice.stripe.com/x",
    });
  });

  it("payment_action_required does NOT change state", () => {
    // Feature doc 17 rule 2 — "never change subscription state on our own
    // inference". An invoice needing SCA is not yet a failed payment; Stripe
    // will send `payment_failed` if it actually fails.
    const intent = interpretEvent(event("invoice.payment_action_required", { customer: "c" }));
    expect(intent.kind).toBe("action-required");
  });

  it("trial_will_end does NOT change state either", () => {
    // A trial three days from ending is still a working trial.
    const intent = interpretEvent(
      event("customer.subscription.trial_will_end", { customer: "c", trial_end: 1_760_000_000 }),
    );
    expect(intent.kind).toBe("trial-ending");
  });
});

describe("interpretEvent never throws", () => {
  for (const [label, payload] of [
    ["null object", null],
    ["empty object", {}],
    ["missing customer", { id: "sub_1" }],
    ["items is not an array", { customer: "c", items: { data: "nope" } }],
  ] as const) {
    it(`survives ${label}`, () => {
      // A throw becomes a 500, and a 500 tells Stripe to retry — forever, for
      // an event we simply could not read.
      expect(() => interpretEvent(event("customer.subscription.updated", payload))).not.toThrow();
    });
  }
});

describe("mapStripeStatus", () => {
  it("maps every status Stripe documents", () => {
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(mapStripeStatus("unpaid")).toBe("UNPAID");
    expect(mapStripeStatus("paused")).toBe("PAUSED");
  });

  it("⚠️ an UNKNOWN status becomes PAST_DUE, not ACTIVE", () => {
    /*
     * Stripe can add statuses; our enum cannot know them. ACTIVE would hand
     * full service to an account in a state we do not understand — the failure
     * that costs money. PAST_DUE is read-only, which under rule 3 means the
     * customer keeps every piece of data and only stops consuming. Wrong that
     * way is a support message; wrong the other way is not recoverable.
     */
    expect(mapStripeStatus("something_new" as never)).toBe("PAST_DUE");
  });
});

describe("price resolution — §9.1's currency map", () => {
  const plan = {
    currencyPrices: {
      gbp: { monthly: "price_gbp_m", annual: "price_gbp_a" },
      eur: { monthly: "price_eur_m" },
    },
    usdMonthlyPriceId: "price_usd_m",
    usdAnnualPriceId: "price_usd_a",
  };

  it("uses the localized price when there is one", () => {
    expect(resolvePriceId({ ...plan, currency: "gbp", interval: "MONTHLY" })).toEqual({
      priceId: "price_gbp_m",
      currency: "gbp",
    });
  });

  it("⚠️ falls back to USD rather than failing", () => {
    // §9.3 bills in USD; GBP/EUR are a convenience. A customer asking for a
    // currency we never provisioned should be charged in USD — annoying but
    // correct — rather than shown an error that loses the sale.
    expect(resolvePriceId({ ...plan, currency: "eur", interval: "ANNUAL" })).toEqual({
      priceId: "price_usd_a",
      currency: "usd",
    });
    expect(resolvePriceId({ ...plan, currency: "jpy", interval: "MONTHLY" })).toEqual({
      priceId: "price_usd_m",
      currency: "usd",
    });
  });

  it("returns null when the plan was never provisioned at all", () => {
    expect(
      resolvePriceId({
        currencyPrices: null,
        usdMonthlyPriceId: null,
        usdAnnualPriceId: null,
        currency: "usd",
        interval: "MONTHLY",
      }),
    ).toBeNull();
  });

  it("⚠️ rejects anything that is not a `price_` id", () => {
    // `currencyPrices` is an unvalidated JSON column. A product id pasted into
    // the wrong field, or a number, must degrade to the USD fallback — not be
    // handed to Stripe, where it fails at checkout in front of a customer.
    const map = readCurrencyPrices({
      gbp: { monthly: "prod_wrong", annual: 42 },
      eur: { monthly: "price_ok" },
    });
    expect(map.gbp).toBeUndefined();
    expect(map.eur?.monthly).toBe("price_ok");
  });

  it("ignores unsupported currencies in the map", () => {
    expect(readCurrencyPrices({ jpy: { monthly: "price_x" } })).toEqual({});
  });

  it("survives a malformed column", () => {
    expect(readCurrencyPrices(null)).toEqual({});
    expect(readCurrencyPrices("nope")).toEqual({});
    expect(readCurrencyPrices([1, 2])).toEqual({});
  });
});
