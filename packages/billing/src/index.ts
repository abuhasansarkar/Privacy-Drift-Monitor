/**
 * `@pdm/billing` — PLAN.md Part IX, Phase 6.
 *
 * ⚠️ EXPLICIT RE-EXPORTS, NOT `export *`. A `.ts` barrel using `export *` is
 * invisible to Node's ESM loader under tsx — the worker died at boot on a
 * symbol that demonstrably existed (AGENTS.md, defect 2). `worker/` consumes
 * this barrel, so every symbol is named.
 */

export type {
  EntitlementSet,
  LimitCheck,
  ResolveInput,
  SubscriptionStatusName,
} from "./entitlements";
export {
  FALLBACK_ENTITLEMENTS,
  NEARING_LIMIT_THRESHOLD,
  UNLIMITED,
  checkLimit,
  isReadOnly,
  isUnlimited,
  resolveEntitlements,
} from "./entitlements";

export type { ConsumedMetric, CountedMetric, UsageSummary } from "./usage";
export {
  CONSUMED_METRICS,
  COUNTED_METRICS,
  METRIC_LIMIT_KEY,
  isConsumedMetric,
  resolvePeriodEnd,
  resolvePeriodStart,
} from "./usage";

export type {
  BillingIntervalName,
  CurrencyPriceMap,
  SupportedCurrency,
} from "./stripe";
export {
  SUPPORTED_CURRENCIES,
  TRIAL_DAYS,
  createStripeClient,
  fromUnix,
  isStripeConfigured,
  isSupportedCurrency,
  mapStripeInterval,
  mapStripeStatus,
  readCurrencyPrices,
  resolvePriceId,
} from "./stripe";

export type { GraceInput, GraceResolution, GraceState, PausableSite } from "./grace";
export { GRACE_DAYS, countToPause, resolveGrace, selectSitesToPause } from "./grace";

export type { CataloguePlan, CataloguePrices } from "./catalogue";
export { PLAN_CATALOGUE, annualSavingMinorUnits } from "./catalogue";

export type { WebhookIntent } from "./webhook";
export { HANDLED_EVENT_TYPES, interpretEvent, isHandledEventType } from "./webhook";
