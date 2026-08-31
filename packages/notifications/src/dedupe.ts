/**
 * DEDUPLICATION AND FLOOD CONTROL — PLAN.md Part VI §6.6.
 *
 * ⚠️ ALERT FATIGUE KILLS THE PRODUCT. This file is not polish: a site that
 * regresses and then re-scans hourly can produce twenty identical emails in a
 * day, and the agency's response is to filter us into a folder — after which
 * the monitoring is worthless even though it works.
 *
 * Three independent controls, all specified in §6.6:
 *   1. Duplicate suppression — one alert per (agency, type, entity) per 4 hours
 *   2. Scan rollup           — >10 alertable issues in one scan collapse to one
 *   3. Failure backoff       — a failing site alerts on the 3rd consecutive
 *                              failure, then at most daily until it recovers
 */

export const DUPLICATE_WINDOW_MS = 4 * 60 * 60 * 1000;
export const ROLLUP_THRESHOLD = 10;
export const FAILURE_ALERT_AFTER_CONSECUTIVE = 3;
export const FAILURE_REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The suppression key.
 *
 * ⚠️ The RECIPIENT is deliberately absent. Suppression is per agency+entity, so
 * a team of six does not receive six copies of a re-fired alert simply because
 * each of them dedupes independently. Per-recipient channel choice is applied
 * afterwards, in `policy.ts`.
 */
export function dedupeKey(params: {
  agencyId: string;
  type: string;
  entityId: string | null;
}): string {
  return `${params.agencyId}:${params.type}:${params.entityId ?? "-"}`;
}

export function isDuplicate(
  lastSentAt: Date | null,
  now: Date,
  windowMs: number = DUPLICATE_WINDOW_MS,
): boolean {
  if (!lastSentAt) return false;
  return now.getTime() - lastSentAt.getTime() < windowMs;
}

export interface RollupInput<T> {
  items: readonly T[];
  websiteLabel: string;
}

export type RollupDecision<T> =
  | { kind: "individual"; items: readonly T[] }
  | { kind: "rollup"; count: number; websiteLabel: string };

/**
 * Collapses an alert storm from one scan into a single message.
 *
 * The rolled-up alert links to a FILTERED LIST rather than trying to summarise
 * twelve findings in a subject line — the agency needs to know the site moved,
 * and the queue is where they triage it.
 */
export function rollup<T>(
  input: RollupInput<T>,
  threshold: number = ROLLUP_THRESHOLD,
): RollupDecision<T> {
  return input.items.length > threshold
    ? { kind: "rollup", count: input.items.length, websiteLabel: input.websiteLabel }
    : { kind: "individual", items: input.items };
}

/**
 * Should a website in a failing state alert right now?
 *
 * A site that has been unreachable for a fortnight has already been reported;
 * repeating it hourly teaches the recipient to ignore the alert that matters.
 */
export function shouldAlertUnreachable(params: {
  consecutiveFailures: number;
  lastAlertedAt: Date | null;
  now: Date;
}): boolean {
  if (params.consecutiveFailures < FAILURE_ALERT_AFTER_CONSECUTIVE) return false;
  if (!params.lastAlertedAt) return true;
  return (
    params.now.getTime() - params.lastAlertedAt.getTime() >= FAILURE_REPEAT_INTERVAL_MS
  );
}
