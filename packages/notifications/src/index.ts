/**
 * @pdm/notifications — alert decision logic, PLAN.md Part VI §6.6.
 *
 * ⚠️ DELIBERATE DEVIATION FROM §12.1's PACKAGE LIST, which does not name this
 * package. The dispatch decision is needed in BOTH processes — the web app
 * writes in-app notifications and resolves preferences, the worker dispatches,
 * digests and defers — so it cannot live in `worker/` without the app importing
 * across a deployable boundary, and it is not "shared utilities". Everything
 * here is pure; the I/O lives in the repositories and the jobs.
 *
 * ⚠️ EXPLICIT NAMED RE-EXPORTS, NOT `export *`. The worker runs TypeScript
 * directly under Node's ESM loader via tsx, and `export * from "./dedupe"` in a
 * `.ts` barrel is not something that linker can see through — the worker died
 * at boot on "does not provide an export named ROLLUP_THRESHOLD" for a symbol
 * that demonstrably exists. `@pdm/database` re-exports the same way, for the
 * same reason.
 */

export type {
  AlertChannel,
  AlertEvent,
  AlertRuleSpec,
  AlertScopeType,
  DispatchContext,
  DispatchPlan,
  EmailDelivery,
  InAppDelivery,
  RecipientSpec,
  SuppressionReason,
} from "./types";
export { ALERT_SCOPE_TYPES } from "./types";

export type { WallClock } from "./timezone";
export {
  isValidTimeZone,
  minutesOfDay,
  offsetMs,
  parseHhMm,
  toWallClock,
  zonedWallClockToInstant,
} from "./timezone";

export type { QuietHoursDecision, QuietHoursWindow } from "./quiet-hours";
export {
  applyQuietHours,
  isWithinQuietHours,
  quietHoursEndInstant,
} from "./quiet-hours";

export type { RollupDecision, RollupInput } from "./dedupe";
export {
  DUPLICATE_WINDOW_MS,
  FAILURE_ALERT_AFTER_CONSECUTIVE,
  FAILURE_REPEAT_INTERVAL_MS,
  ROLLUP_THRESHOLD,
  dedupeKey,
  isDuplicate,
  rollup,
  shouldAlertUnreachable,
} from "./dedupe";

export { meetsSeverity, planDispatch, ruleMatches, ruleMatchesScope } from "./policy";

export type { DigestGroup, DigestItem } from "./digest";
export {
  DIGEST_HOUR,
  WEEKLY_DIGEST_WEEKDAY,
  digestTotals,
  digestWindow,
  groupDigest,
  nextDailyDigestAt,
  nextWeeklyDigestAt,
} from "./digest";

export type { NotificationCopy } from "./copy";
export {
  DEFAULT_SEVERITY,
  DEFAULT_TRIGGER_TYPES,
  NOTIFICATION_COPY,
  renderCopy,
} from "./copy";

export type { SlackAlertOptions, SlackDeliveryResult } from "./slack";
export { buildSlackBlocks, sendSlackAlert } from "./slack";

