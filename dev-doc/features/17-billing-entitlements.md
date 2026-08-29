# Feature 17 — Billing & Entitlements

> **Phase:** 6 · **Priority:** P0 · **Effort:** L + L + M · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part IX §9.2–§9.4 (plans, entitlements, margins), Part XII §12.4 M10

## What it is

Stripe checkout and portal, four plans, trials, webhook-driven subscription state, and the
entitlement service that is **the single source of plan logic**, enforced at nine points.

## Why it exists

Revenue. Also: plan logic scattered across call sites becomes nine different interpretations
of "what does Professional include", which is a support and billing-dispute generator.

## Dependencies

Feature 01 (agencies). Coverage-gated: **≥ 85% on `packages/billing`.**

## Public interface

```ts
EntitlementService   // packages/billing/src/entitlements.ts
```

## Build steps

### Entitlements first
- [ ] `EntitlementService` — the only place plan logic lives
- [ ] Entitlement dimensions per Part IX §9.2–§9.4
- [ ] **Enforcement at all nine points** — enumerate them explicitly and test each
- [ ] Usage metering: websites, scans this period, AI credits, team seats, storage
- [ ] Counter reconciliation job (denormalized counters drift under concurrency)

### Stripe
- [ ] Products + prices in **three currencies** (billing is USD; GBP/EUR are localized Prices)
- [ ] Checkout session (upgrades) and Billing Portal (downgrades, cancellation)
- [ ] **All** webhook handlers; **verify the signature before parsing the body**
- [ ] Unknown event types return **200** — a 4xx makes Stripe retry forever
- [ ] Idempotent processing keyed on the Stripe event ID
- [ ] Event log with replay
- [ ] **Daily reconciliation job against Stripe**
- [ ] Trials: 14 days, no card

### UI
- [ ] `/app/billing`: plan card, usage meters with over-limit states, invoice history,
      payment method, billing email, VAT/tax ID
- [ ] Trial banner with days remaining; past-due banner with a retry-payment CTA
- [ ] Upgrade/downgrade flows and grace handling
- [ ] `/pricing` with monthly/annual toggle, currency selector, comparison table (feature 20)

## The four rules that prevent billing disasters

**1. The webhook drives entitlements, not the checkout redirect.** A user who closes the tab
still gets what they paid for; a forged redirect grants nothing.

**2. Never change subscription state on our own inference.** During a Stripe outage existing
subscriptions keep working and a banner explains billing is temporarily unavailable.
Reconciliation syncs once Stripe recovers, and Stripe replays missed webhooks.

**3. Payment failure degrades to read-only scanning without hiding data.** The agency keeps
access to everything it has; it just stops generating new scans. Hiding data on non-payment is
hostile and a support disaster.

**4. A downgrade over-limit triggers grace, not deletion.**

## Acceptance criteria

- [ ] Checkout creates a subscription and the entitlement change is **driven by the webhook**
- [ ] A duplicate webhook is a no-op; replayed events are idempotent
- [ ] Every entitlement is enforced at its point of use (all nine)
- [ ] Payment failure moves the agency to read-only scanning while leaving all data visible
- [ ] A downgrade over-limit triggers grace
- [ ] Usage counters are accurate **under concurrency**
- [ ] Unknown webhook types return 200
- [ ] Signature verification happens before body parsing
- [ ] Reconciliation catches divergence within 24 h
- [ ] Tax/VAT collection configured

## Tests required

| Level | What |
|---|---|
| Unit | Entitlement resolution per plan × dimension |
| Integration | Stripe webhook processing from fixture events; **replayed events are idempotent**; concurrent usage-counter increments |
| E2E | Billing checkout (Stripe test mode) → webhook → entitlement change |
| Manual | Live-mode flow with a real card and immediate refund, pre-launch |

## Failure modes

| Mode | Handling |
|---|---|
| Stripe outage | Checkout and portal unavailable; existing subscriptions keep working; banner shown; reconciliation on recovery |
| Webhook loss | Idempotent processing + event log with replay + **daily reconciliation** catches divergence within 24 h |
| Counter drift under concurrency | Reconciliation job; alert if it ever finds non-zero drift |

## Assumptions to validate

- §12.8 #1: agencies will pay $49–$799/month. *Validate with 20 interviews and 10 pre-sales
  before Phase 6 completes* — this is the assumption the whole business rests on.
- §12.8 #2: agencies can resell at $10–25/site/month for a 3–7× margin. This is the core sales
  argument and the justification for site-count pricing.
- §12.8 #19: 14 days is the right trial length for a product whose value needs **two scans** to
  demonstrate drift. If activation clusters late, extend to 21.
