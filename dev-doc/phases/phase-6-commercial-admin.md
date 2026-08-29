# Phase 6 — Commercial & Admin

> **Goal:** the product can be sold and operated.
> **Dependencies:** Phase 5 · **Status:** ⬜ Not started
> **Plan ref:** Part XII §12.3 (Phase 6), Part IX (all), Part III §3.12, Part X

Two audiences in one phase: the buyer (billing, pricing, free scanner) and us (admin panel,
flags, retention).

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 6.1 | Stripe: products, prices (3 currencies), checkout, portal, all webhook handlers, reconciliation job | L | [17-billing-entitlements](../features/17-billing-entitlements.md) | ⬜ |
| 6.2 | Entitlement service + enforcement at all nine points + usage metering | L | [17-billing-entitlements](../features/17-billing-entitlements.md) | ⬜ |
| 6.3 | Billing UI: plan card, usage meters, invoices, upgrade/downgrade, grace handling | M | [17-billing-entitlements](../features/17-billing-entitlements.md) | ⬜ |
| 6.4 | Pricing page with currency toggle and comparison table | M | [20-marketing-site](../features/20-marketing-site.md) | ⬜ |
| 6.5 | Free public scanner: flow, Turnstile, rate limits, isolated queue, result page, conversion tracking | L | [18-free-public-scanner](../features/18-free-public-scanner.md) | ⬜ |
| 6.6 | Admin panel: all 15 pages | XL | [19-admin-panel](../features/19-admin-panel.md) | ⬜ |
| 6.7 | Feature flags: service, admin UI, resolution | M | [22-observability-ops](../features/22-observability-ops.md) | ⬜ |
| 6.8 | Analytics instrumentation (all events) | M | [22-observability-ops](../features/22-observability-ops.md) | ⬜ |
| 6.9 | Cleanup/retention jobs + counter reconciliation | M | [22-observability-ops](../features/22-observability-ops.md) | ⬜ |

## Order of attack

```
6.2 entitlements  →  6.1 Stripe  →  6.3 billing UI  →  6.4 pricing page
6.7 flags (early — everything else can ship behind one)
6.5 free scanner (independent, but needs 6.7 for the circuit breaker)
6.6 admin panel (large but low-risk; parallelizable)
6.9 retention (must land before launch — it is a data-minimization obligation)
```

Build **6.2 entitlements before 6.1 Stripe**. Plan logic must live in exactly one place; if
Stripe lands first, entitlement checks get scattered across call sites and the "nine
enforcement points" become nine different interpretations.

## Critical implementation rules

**The webhook drives entitlements, not the checkout redirect.** A user who closes the tab
before redirect still gets what they paid for; a user who forges a redirect gets nothing.

**Every webhook is idempotent.** A duplicate delivery is a no-op. Verify the signature
*before* parsing the body. Unknown event types return 200 — never 4xx, which makes Stripe
retry forever.

**Never change subscription state on our own inference.** During a Stripe outage existing
subscriptions keep working and a banner explains billing is unavailable. A daily
reconciliation job syncs state once Stripe recovers.

**Payment failure degrades to read-only scanning without hiding data.** The agency keeps
access to everything it has; it just stops generating new scans. Deleting or hiding data on
non-payment is both hostile and a support disaster.

**A downgrade over-limit triggers grace, not deletion.**

**The free scanner is the highest-risk public surface in the product.** It accepts an
arbitrary URL from an unauthenticated user and drives a browser at it. Every abuse control in
Part III §3.2 is mandatory: Turnstile, IP rate limits, per-domain global rate limit, a global
circuit breaker, a **dedicated low-priority `scan:free` queue that cannot starve paying
customers**, the full SSRF guard, and an admin blocklist.

**Admin reads of tenant data are audit-logged**, including impersonation, which is
time-limited and reason-required.

## Acceptance criteria

From §12.3 and M10 (§12.4).

- [ ] Checkout creates a subscription and the entitlement change is driven **by the webhook**
- [ ] A duplicate webhook is a no-op; replayed events are idempotent
- [ ] Every entitlement is enforced at its point of use (all nine)
- [ ] Payment failure moves the agency to read-only for scanning while leaving all data visible
- [ ] A downgrade over-limit triggers grace, not deletion
- [ ] Usage counters are accurate under concurrency
- [ ] The free scanner enforces every abuse control
- [ ] The free-scan queue cannot starve the paid queue
- [ ] An admin can retry a failed job and add a tracker vendor
- [ ] Retention deletes expired evidence but **never evidence attached to an open issue**
- [ ] Feature flags resolve: agency override → plan targeting → percentage rollout → global default

## Feature flags as kill switches

Flags are operational controls, not just rollout tooling:

| Flag | Kill-switch use |
|---|---|
| `AI_AUTO_EXPLAIN` | Stops all automatic AI spend instantly |
| `ADVANCED_SCAN` | Reduces scanner load during an incident |
| `SCORING_ENGINE_V2` | Shadow-mode rollout — compute both, store both, compare, then flip |

Every flag needs an owner and a removal date recorded in `/admin/feature-flags`.
