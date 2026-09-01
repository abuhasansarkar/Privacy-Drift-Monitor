import "server-only";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import {
  buildClientMessageContext,
  buildDriftContext,
  buildIssueContext,
  loadAIConfig,
  platformSpendKey,
  resolveProvider,
  runAI,
  usdToMicroCents,
  type AIRunOutcome,
  type AIRunPorts,
  type ClientMessageContext,
  type DriftContext,
  type IssueContext,
  type ModelTier,
  type RunnableFeature,
} from "@pdm/ai";
import { repositoriesFor } from "@pdm/database/repositories";
import { logger } from "@pdm/shared/logger";
import type { AgencyContext } from "@/server/auth/context";
import { getEntitlements } from "@/server/entitlements";

/**
 * AI SERVICE — PLAN.md Part VIII §8.2, Phase 5 task 5.6.
 *
 * Binds `@pdm/ai`'s pure orchestrator to this app's Prisma, Redis and tenant
 * context. All the sequencing, budgeting and validation logic lives in the
 * package; this file supplies the four ports and nothing else.
 *
 * ⚠️ EVERY ENTRY POINT HERE TAKES AN `AgencyContext` AND SCOPES THROUGH
 * `repositoriesFor(ctx.agencyId)`. An AI output is generated from one agency's
 * evidence and is that agency's data — P4 applies to it exactly as it applies
 * to a scan. The `agencyId` comes from the session and is never a parameter a
 * caller can choose.
 *
 * ⚠️ NOTHING HERE THROWS FOR AN AI FAILURE. Callers render an outcome. P3:
 * "Findings render with or without AI" — an issue page that 500s because the
 * provider is down has turned an additive feature into a load-bearing one.
 */

const globalForAi = globalThis as unknown as { pdmAiRedis?: IORedis };

/**
 * ⚠️ CACHED ON `globalThis` for the same reason the queue connections are: Next
 * dev reloads modules on every edit, and a client created at module scope opens
 * a new Redis connection per reload until the server refuses more.
 */
function redis(): IORedis {
  globalForAi.pdmAiRedis ??= new IORedis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: 2, enableReadyCheck: true },
  );
  return globalForAi.pdmAiRedis;
}

/**
 * The current billing period start.
 *
 * ⚠️ CALENDAR MONTH FOR NOW, and §5 is explicit that `UsageRecord.periodStart`
 * is "aligned to the Stripe billing period, not the calendar month". Billing
 * lands in Phase 6; until a `Subscription` row exists there is no billing
 * period to align to, so this is the honest approximation and the one place
 * Phase 6 has to change. Stated rather than left as a silent assumption.
 */
function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function makePorts(agencyId: string, userId: string | null): AIRunPorts {
  const repos = repositoriesFor(agencyId);
  const config = loadAIConfig();
  const client = redis();

  return {
    async findCached(inputHash) {
      const row = await repos.ai.findCached(inputHash, config.cacheTtlDays);
      return row ? { id: row.id, output: row.output } : null;
    },

    async record(row) {
      const created = await repos.ai.record({
        ...row,
        userId: row.userId ?? userId,
        output: (row.output ?? null) as never,
        validationErrors: (row.validationErrors ?? null) as never,
      });
      return { id: created.id };
    },

    async loadAgencyState() {
      const [settings, creditsUsed] = await Promise.all([
        repos.ai.settings(),
        repos.ai.creditsUsedSince(currentPeriodStart()),
      ]);
      /*
       * ⚠️ ENFORCEMENT POINT (§9.2): "AI call → consume(AI_CREDITS, cost) →
       * 402, feature shows quota state".
       *
       * TWO CAPS EXIST AND THE EFFECTIVE ONE IS THE SMALLER:
       *
       *   plan `aiCreditsPerMonth`            — what they BOUGHT. The ceiling.
       *   `AgencyAiSettings.monthlyCreditCap` — what they CHOSE. A self-imposed
       *                                         budget on the AI settings page.
       *
       * The agency's own setting alone would let anyone raise their limit past
       * the plan by editing a form — a free upgrade. The plan alone would
       * silently ignore a customer who deliberately capped their own spend,
       * which is the whole reason that control exists.
       *
       * ⚠️ THE PLAN LIMIT CARRIES §9.2's READ-ONLY MODIFIER, which zeroes
       * `aiCreditsPerMonth` for a PAST_DUE agency. So a billing failure stops
       * AI spend here without `packages/ai` knowing anything about billing —
       * exactly the separation §8.9 wants: the AI layer sees a number, not a
       * subscription.
       */
      const ownCap = settings?.monthlyCreditCap ?? null;

      const planCap = (await getEntitlements(agencyId)).aiCreditsPerMonth;

      return {
        // ⚠️ NO ROW MEANS DEFAULTS, and the default for `aiEnabled` is ON — the
        // schema says so and an agency that never opened the settings page
        // should still see explanations. `autoExplainCritical` is the opposite
        // (see `shouldAutoExplain`), because that one spends money unprompted.
        aiEnabled: settings?.aiEnabled ?? true,
        monthlyCreditCap: ownCap === null ? planCap : Math.min(ownCap, planCap),
        creditsUsedThisPeriod: creditsUsed,
      };
    },

    async loadPlatformState() {
      const raw = await client.get(platformSpendKey(new Date())).catch(() => null);
      return {
        // ⚠️ A REDIS FAILURE READS AS ZERO SPEND, i.e. it FAILS OPEN. The
        // alternative — treating an unreachable Redis as "budget exhausted" —
        // would take every AI surface down platform-wide on a cache blip, to
        // protect a $50 cap that the per-agency credit caps already sit under.
        // The tenant cap is the enforcing control; this is the backstop, and a
        // backstop that fires on its own outage is worse than the risk.
        spentMicroCentsToday: raw ? Number(raw) || 0 : 0,
        dailyBudgetMicroCents: usdToMicroCents(config.dailyBudgetUsd),
      };
    },

    async addPlatformSpend(microCents) {
      const key = platformSpendKey(new Date());
      try {
        await client.incrby(key, microCents);
        // 48 h, not 24: the key is dated, so an expiry slightly longer than a
        // day costs one extra key and removes every timezone edge case.
        await client.expire(key, 48 * 3600);
      } catch (error) {
        // Losing a spend increment under-counts the platform total; it cannot
        // over-charge anyone. Log and continue rather than failing the call
        // whose result the user is waiting for.
        logger.warn({ err: error }, "failed to record platform AI spend");
      }
    },

    dedupe: {
      async acquire(key, ttlMs) {
        const set = await client.set(key, "1", "PX", ttlMs, "NX");
        return set === "OK";
      },
      async release(key) {
        await client.del(key);
      },
      async publish(key, value, ttlMs) {
        await client.set(key, value, "PX", ttlMs);
      },
      async read(key) {
        return client.get(key);
      },
    },
  };
}

export interface AiCallOptions {
  feature: RunnableFeature;
  context: IssueContext | DriftContext | ClientMessageContext;
  entityType: string;
  entityId: string;
  issueId?: string | null;
}

/**
 * The single call every AI surface goes through.
 *
 * ⚠️ THE AGENCY'S `modelTier` OVERRIDE IS APPLIED HERE, not inside the package.
 * §8.3 makes the tier "overridable per agency via `AgencyAiSettings.modelTier`",
 * and that is a tenant setting — the package must not have to know what an
 * agency is.
 */
export async function callAI(
  ctx: AgencyContext,
  options: AiCallOptions,
): Promise<AIRunOutcome> {
  const repos = repositoriesFor(ctx.agencyId);
  const settings = await repos.ai.settings();
  const config = loadAIConfig();

  const tierOverride: ModelTier | undefined =
    settings?.modelTier === "ADVANCED"
      ? "advanced"
      : settings?.modelTier === "STANDARD"
        ? "standard"
        : undefined;

  const toggles = (settings?.featureToggles ?? {}) as Record<string, unknown>;
  const toggle = toggles[options.feature];

  return runAI(
    {
      feature: options.feature,
      context: options.context,
      entityType: options.entityType,
      entityId: options.entityId,
      issueId: options.issueId ?? null,
      userId: ctx.userId,
      traceId: randomUUID(),
      ...(tierOverride ? { tierOverride } : {}),
      ...(typeof toggle === "boolean" ? { featureEnabled: toggle } : {}),
    },
    {
      provider: resolveProvider(config),
      ports: makePorts(ctx.agencyId, ctx.userId),
      config,
    },
  );
}

/**
 * Reads back the stored output for an entity, for the initial page render.
 *
 * ⚠️ A READ, NOT A GENERATE. Opening an issue must never trigger a paid call —
 * §8.9's "on-demand by default" is the lever that "avoids paying to explain
 * issues no one opens", and a page that generated on render would defeat it
 * while looking identical.
 */
export async function readStoredOutput(
  ctx: AgencyContext,
  feature: RunnableFeature,
  entityType: string,
  entityId: string,
) {
  const repos = repositoriesFor(ctx.agencyId);
  const row = await repos.ai.findLatestFor({ feature, entityType, entityId });
  if (!row?.output) return null;
  return {
    requestId: row.id,
    output: row.output,
    createdAt: row.createdAt,
    feedbackScore: row.feedbackScore,
    promptVersion: row.promptVersion,
    model: row.model,
  };
}

/**
 * §8.9's opt-in auto-explain, resolved in the SAFE direction.
 *
 * ⚠️ THE SCHEMA DEFAULTS `autoExplainCritical` TO TRUE AND THAT DEFAULT IS
 * WRONG FOR AN ABSENT ROW. Feature doc 16's trap list: "Auto-explaining every
 * Critical issue is an opt-in agency setting, not a default-on behaviour — it
 * is the main uncontrolled cost vector." An agency that has never opened the
 * settings page has not opted in to anything, so no row means no spend. The
 * flag is checked too: `AI_AUTO_EXPLAIN` off "stops all automatic AI spend
 * instantly", which only works if it is consulted on this path.
 */
export function shouldAutoExplain(
  settings: { aiEnabled: boolean; autoExplainCritical: boolean } | null,
  flagEnabled: boolean,
): boolean {
  if (!flagEnabled) return false;
  if (!settings) return false;
  return settings.aiEnabled && settings.autoExplainCritical;
}

export {
  buildClientMessageContext,
  buildDriftContext,
  buildIssueContext,
};
