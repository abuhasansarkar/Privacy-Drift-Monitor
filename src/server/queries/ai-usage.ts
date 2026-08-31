import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { loadAIConfig, microCentsToUsd } from "@pdm/ai";
import type { AgencyContext } from "@/server/auth/context";

/**
 * AI USAGE — PLAN.md Part VIII §8.9, Phase 5 task 5.8.
 *
 * Feeds the credit meter and the usage chart on the AI settings page.
 *
 * ⚠️ CREDITS AND COST ARE TWO DIFFERENT NUMBERS AND ONLY ONE IS THE CUSTOMER'S.
 * §8.9: a customer is billed in CREDITS (1 standard, 3 advanced, 0 cached, 0
 * failed); `costMicroCents` is OUR provider spend, kept for margin tracking.
 * Showing an agency our cost would be showing them our margin, so the agency
 * surface returns credits and the cost stays behind the admin boundary.
 */

export interface AiUsageDay {
  date: string;
  credits: number;
  calls: number;
  cached: number;
  failed: number;
}

export interface AiUsageSummary {
  creditsUsed: number;
  creditCap: number | null;
  /**
   * `null` when no cap is configured.
   *
   * ⚠️ THE CALLER MUST RENDER THIS AS *UNKNOWN*, NOT *UNLIMITED*. The same rule
   * `src/server/entitlements.ts` states for website limits: a meter drawn
   * against a made-up denominator is worse than no meter. Billing supplies the
   * real cap in Phase 6; until then the page hides the bar and shows the count.
   */
  percentUsed: number | null;
  /** §8.9 notifies at 80%. */
  nearingCap: boolean;
  totalCalls: number;
  cacheHits: number;
  /** §8.6 surfaces this as the signal that a prompt needs revision. */
  validationFailures: number;
  days: AiUsageDay[];
  periodStart: Date;
  /** Whether a provider is configured at all — drives the "AI is off" banner. */
  providerConfigured: boolean;
}

/** §8.9's 80% warning threshold, mirrored from `@pdm/ai`. */
const WARN_AT = 0.8;

export async function getAiUsage(
  ctx: AgencyContext,
  days = 30,
): Promise<AiUsageSummary> {
  const repos = repositoriesFor(ctx.agencyId);
  const config = loadAIConfig();

  /*
   * ⚠️ THE CHART WINDOW AND THE BILLING WINDOW ARE DIFFERENT AND MUST NOT BE
   * CONFLATED. The chart shows the last N days; the credit meter must show the
   * BILLING PERIOD, because that is what the cap resets against. Summing the
   * chart's rows into the meter would under-report on the 1st of a month and
   * over-report on the 31st.
   */
  const periodStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  );
  const chartFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [settings, creditsUsed, rows] = await Promise.all([
    repos.ai.settings(),
    repos.ai.creditsUsedSince(periodStart),
    repos.ai.usageByDay(chartFrom),
  ]);

  const byDay = new Map<string, AiUsageDay>();
  let cacheHits = 0;
  let validationFailures = 0;

  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const day = byDay.get(date) ?? {
      date,
      credits: 0,
      calls: 0,
      cached: 0,
      failed: 0,
    };
    day.credits += row.creditsCharged;
    day.calls += 1;
    if (row.fromCache) {
      day.cached += 1;
      cacheHits += 1;
    }
    if (row.status === "VALIDATION_FAILED") {
      day.failed += 1;
      validationFailures += 1;
    }
    byDay.set(date, day);
  }

  const creditCap = settings?.monthlyCreditCap ?? null;

  return {
    creditsUsed,
    creditCap,
    percentUsed: creditCap === null || creditCap === 0
      ? null
      : Math.min(100, Math.round((creditsUsed / creditCap) * 100)),
    nearingCap: creditCap !== null && creditCap > 0 && creditsUsed / creditCap >= WARN_AT,
    totalCalls: rows.length,
    cacheHits,
    validationFailures,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    periodStart,
    providerConfigured: config.enabled,
  };
}

/** Exported for the admin surface, which may show our own spend. */
export function usdOf(microCents: number): number {
  return microCentsToUsd(microCents);
}
