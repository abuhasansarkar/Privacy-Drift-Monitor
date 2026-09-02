# Module 16 — Stripe Billing & Entitlement Enforcement

> **Tier:** MVP · **Package:** `@pdm/billing`, `src/server/services/billing.ts`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Plan logic scattered across individual API handlers results in billing inconsistencies and dispute headaches. All entitlement resolution and usage tracking must live in one pure, centralized service.

## 2. Architecture & The 4 Plans
* **Plans:** Starter ($49), Growth ($149 — Featured), Agency ($349), Scale ($799).
* **Multi-Currency:** Fixed price points in USD, GBP (£39/£119/£279/£639), and EUR (€45/€139/€325/€745).
* **9-Point Enforcement:** Websites, seats, scan frequency, concurrent workers, AI credits, white-label, client portal users, retention days, and API access.
* **Graceful Degradation:** Payment failures place agencies into read-only scanning mode without hiding historical evidence or client reports.

## 3. Webhook Idempotency
```typescript
// src/server/services/billing-webhook.ts
export async function applyWebhookIntent(event: Stripe.Event, intent: WebhookIntent): Promise<WebhookOutcome>;
```
Every webhook is deduplicated using `stripeEventId` unique constraints.

## 4. Key Files
* `packages/billing/src/catalogue.ts`: Master price list and plan entitlements.
* `src/server/entitlements.ts`: Server-side entitlement checks (`getEntitlements`, `checkMetricLimit`).
* `src/server/services/billing-webhook.ts`: Stripe webhook intent application.

## 5. Acceptance Criteria
* **Given** an agency with a Growth plan (40 websites limit),
* **When** attempting to onboard a 41st website,
* **Then** the request is rejected with `LIMIT_REACHED`,
* **And** the UI offers an upgrade button to the Agency plan.
