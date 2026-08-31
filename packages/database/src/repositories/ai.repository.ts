import type { Prisma } from "@prisma/client";
import type { TenantClient } from "../tenant";

/**
 * AI REPOSITORY — PLAN.md Part VIII §8.9 (caching, metering), Part V §5.
 *
 * `AIRequest` is three things in one table, which is why the reads below look
 * unrelated: it is the **call log**, the **response cache** and the **metering
 * ledger**. §5's model comment says exactly that, and collapsing them was the
 * right call — a cache hit and a billing row describe the same event, and
 * splitting them would make "was this call charged?" a join.
 *
 * ⚠️ EVERY READ HERE IS TENANT-SCOPED, INCLUDING THE CACHE LOOKUP. It would be
 * tempting to share a cache entry across agencies — the same issue on the same
 * CMS produces the same context, and the hit rate would be higher. It is
 * forbidden: `inputHash` covers evidence ids, which are Agency A's data, and a
 * cross-tenant read would let Agency B's page render text generated from
 * Agency A's evidence. P4 is not negotiable for a cost optimisation.
 */

export interface AIRequestRecord {
  feature: string;
  provider: string;
  model: string;
  status: string;
  promptVersion: string;
  inputHash: string;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  issueId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costMicroCents: number | null;
  latencyMs: number | null;
  creditsCharged: number;
  output: Prisma.InputJsonValue | null;
  validationErrors: Prisma.InputJsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  fromCache: boolean;
}

export function aiRepository(db: TenantClient, agencyId: string) {
  return {
    /**
     * §8.9's cache read: a SUCCESSFUL row with this `inputHash` inside the TTL.
     *
     * ⚠️ `status: "SUCCESS"` IS LOAD-BEARING. Failed and rejected calls are
     * logged with the same `inputHash` (that is how the admin failure-rate
     * chart works), so a lookup without this filter would serve a validation
     * rejection as if it were an answer — the exact hallucination-reaches-a-
     * client path this layer exists to close.
     *
     * ⚠️ `fromCache: false` too: a cache hit writes its own row, and matching
     * one would let a hit chain off a hit and outlive the TTL indefinitely.
     */
    async findCached(inputHash: string, ttlDays: number) {
      const since = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
      return db.aIRequest.findFirst({
        where: {
          inputHash,
          status: "SUCCESS",
          fromCache: false,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      });
    },

    async findById(id: string) {
      return db.aIRequest.findFirst({ where: { id } });
    },

    /** The output currently shown for one entity + feature, if any. */
    async findLatestFor(input: {
      feature: string;
      entityType: string;
      entityId: string;
    }) {
      return db.aIRequest.findFirst({
        where: {
          feature: input.feature as never,
          entityType: input.entityType,
          entityId: input.entityId,
          status: "SUCCESS",
        },
        orderBy: { createdAt: "desc" },
      });
    },

    async record(input: AIRequestRecord) {
      return db.aIRequest.create({
        data: {
          agencyId,
          feature: input.feature as never,
          provider: input.provider,
          model: input.model,
          status: input.status as never,
          promptVersion: input.promptVersion,
          inputHash: input.inputHash,
          userId: input.userId,
          entityType: input.entityType,
          entityId: input.entityId,
          issueId: input.issueId,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens:
            input.promptTokens !== null && input.completionTokens !== null
              ? input.promptTokens + input.completionTokens
              : null,
          costMicroCents: input.costMicroCents,
          latencyMs: input.latencyMs,
          creditsCharged: input.creditsCharged,
          output: input.output ?? undefined,
          validationErrors: input.validationErrors ?? undefined,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          fromCache: input.fromCache,
        },
      });
    },

    /**
     * §8.8's feedback loop: thumbs up/down → `feedbackScore` → per-prompt-version
     * acceptance rate in admin.
     *
     * ⚠️ `updateMany`, NOT `update`. The tenant extension injects `agencyId`
     * into a `where` clause; `update` requires a unique selector and would let
     * a caller address a row by primary key alone — i.e. another agency's row.
     * `updateMany` keeps the predicate, and a zero count is the tenant check
     * doing its job rather than an error.
     */
    async setFeedback(id: string, score: -1 | 0 | 1) {
      const result = await db.aIRequest.updateMany({
        where: { id },
        data: { feedbackScore: score },
      });
      return result.count > 0;
    },

    /**
     * Credits consumed in the current billing period, for the pre-call cap
     * check (§8.9).
     *
     * ⚠️ SUMMED FROM THE LEDGER, not read from a counter. A counter needs a
     * transaction with every call to stay correct under concurrency, and a
     * counter that drifts silently under-bills or over-blocks with no way to
     * reconstruct the truth. The sum is over an indexed
     * `(agencyId, createdAt DESC)` range of at most a month of rows.
     */
    async creditsUsedSince(since: Date): Promise<number> {
      const result = await db.aIRequest.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { creditsCharged: true },
      });
      return result._sum.creditsCharged ?? 0;
    },

    /**
     * `AgencyAiSettings`, or `null` when the agency has never opened the page.
     *
     * ⚠️ THE CALLER MUST NOT TREAT `null` AS "ALL DEFAULTS ON". The schema
     * defaults `autoExplainCritical` to true, but §8.9 and the feature doc's
     * trap list both say auto-explaining every Critical issue is an OPT-IN
     * ("it is the main uncontrolled cost vector"). `resolveAiSettings()` in the
     * service layer resolves that conflict in the opt-in direction; a row that
     * was never written must not spend money.
     */
    async settings() {
      return db.agencyAiSettings.findFirst();
    },

    async upsertSettings(input: {
      aiEnabled: boolean;
      autoExplainCritical: boolean;
      modelTier: "STANDARD" | "ADVANCED";
      monthlyCreditCap: number | null;
      featureToggles: Prisma.InputJsonValue;
    }) {
      return db.agencyAiSettings.upsert({
        where: { agencyId },
        create: { ...input, agencyId },
        update: input,
      });
    },

    /** The usage chart on the AI settings page (§8.9, task 5.8). */
    async usageByDay(since: Date) {
      const rows = await db.aIRequest.findMany({
        where: { createdAt: { gte: since } },
        select: {
          createdAt: true,
          feature: true,
          creditsCharged: true,
          costMicroCents: true,
          status: true,
          fromCache: true,
        },
        orderBy: { createdAt: "asc" },
      });
      return rows;
    },

    agencyId,
  };
}

export type AIRepository = ReturnType<typeof aiRepository>;
