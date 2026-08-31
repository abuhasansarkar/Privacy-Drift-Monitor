import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import {
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
import type { AiJobData } from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";

/**
 * AI JOB — PLAN.md Part VII §7.2 (`ai` queue), Part VIII §8.2, Phase 5 task 5.6.
 *
 * The asynchronous path into the same orchestrator the web app uses. It exists
 * for ONE case: `autoExplainCritical`, where nobody is waiting on the result
 * (§8.5 feature 1, "generated … automatically for Critical issues when
 * `autoExplainCritical` is on and credits remain").
 *
 * ⚠️ IT SHARES `runAI` WITH THE SERVER ACTION RATHER THAN REIMPLEMENTING IT.
 * The cache→budget→dedupe→provider→validate→persist sequence is a SAFETY
 * ORDER, not a convenience: two copies of it is how one of them quietly loses
 * the pre-call budget check. `packages/ai` owns the sequence; this file owns
 * only the ports.
 *
 * ⚠️ A FAILED AI JOB IS NOT A FAILED SCAN. Nothing downstream depends on an
 * explanation existing (P3, feature doc 16: "Nothing depends on this — by
 * design"), so this job returns rather than throwing on a rejected output. It
 * throws ONLY for a retryable transport error, because that is the only case
 * BullMQ can improve by trying again.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let client: IORedis | null = null;
function redis(): IORedis {
  client ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: 2 });
  return client;
}

export async function closeAiRedis(): Promise<void> {
  await client?.quit().catch(() => {});
  client = null;
}

/** Calendar month for now; Phase 6's `Subscription` supplies the real period. */
function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function makePorts(agencyId: string, userId: string | null): AIRunPorts {
  const repos = repositoriesFor(agencyId);
  const config = loadAIConfig();
  const conn = redis();

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
      return {
        aiEnabled: settings?.aiEnabled ?? true,
        monthlyCreditCap: settings?.monthlyCreditCap ?? null,
        creditsUsedThisPeriod: creditsUsed,
      };
    },
    async loadPlatformState() {
      const raw = await conn.get(platformSpendKey(new Date())).catch(() => null);
      return {
        spentMicroCentsToday: raw ? Number(raw) || 0 : 0,
        dailyBudgetMicroCents: usdToMicroCents(config.dailyBudgetUsd),
      };
    },
    async addPlatformSpend(microCents) {
      const key = platformSpendKey(new Date());
      try {
        await conn.incrby(key, microCents);
        await conn.expire(key, 48 * 3600);
      } catch {
        // Under-counts the platform total; cannot over-charge anyone.
      }
    },
    dedupe: {
      async acquire(key, ttlMs) {
        return (await conn.set(key, "1", "PX", ttlMs, "NX")) === "OK";
      },
      async release(key) {
        await conn.del(key);
      },
      async publish(key, value, ttlMs) {
        await conn.set(key, value, "PX", ttlMs);
      },
      async read(key) {
        return conn.get(key);
      },
    },
  };
}

export interface AiJobSummary {
  status: "generated" | "cached" | "skipped";
  errorCode?: string;
  requestId?: string;
}

export async function processAiJob(data: AiJobData): Promise<AiJobSummary> {
  // `component` rather than a `feature` key: `LogContext` is a closed set of
  // correlation ids, and widening it for one job would let every job add its
  // own. The feature travels in the per-line payload below instead.
  const log = childLogger({ agencyId: data.agencyId, component: "ai" });

  const context = await buildContext(data);
  if (!context) {
    // The entity was deleted, or there is nothing to summarise. Not an error —
    // an auto-explain job for an issue somebody resolved and cleaned up is
    // exactly the race this branch exists for.
    log.info(
      { feature: data.feature, entityId: data.entityId },
      "ai job skipped: no context could be built",
    );
    return { status: "skipped" };
  }

  const repos = repositoriesFor(data.agencyId);
  const settings = await repos.ai.settings();
  const config = loadAIConfig();

  const tierOverride: ModelTier | undefined =
    settings?.modelTier === "ADVANCED"
      ? "advanced"
      : settings?.modelTier === "STANDARD"
        ? "standard"
        : undefined;

  const outcome: AIRunOutcome = await runAI(
    {
      feature: data.feature as RunnableFeature,
      context,
      entityType: data.entityType,
      entityId: data.entityId,
      issueId: data.issueId,
      userId: data.userId,
      traceId: randomUUID(),
      ...(tierOverride ? { tierOverride } : {}),
    },
    {
      provider: resolveProvider(config),
      ports: makePorts(data.agencyId, data.userId),
      config,
    },
  );

  if (outcome.ok) {
    log.info(
      { feature: data.feature, entityId: data.entityId, fromCache: outcome.fromCache },
      "ai output stored",
    );
    return {
      status: outcome.fromCache ? "cached" : "generated",
      requestId: outcome.requestId,
    };
  }

  /*
   * ⚠️ ONLY A TRANSPORT FAILURE IS RETRIED, and even that only once more (§7.2
   * gives this queue 2 attempts). The others are terminal by nature:
   *
   *   QUOTA_EXCEEDED / PLATFORM_BUDGET_EXCEEDED — the cap will still be reached
   *     in ten seconds, and a retry storm against a budget is how a cap turns
   *     into a queue that never drains.
   *   AI_DISABLED — a configuration state, not a fault.
   *   GROUNDING/TERMINOLOGY/CLAIM/VALIDATION — the model answered and we
   *     refused the answer. Asking again with an identical context spends money
   *     to be refused identically; §8.8 is explicit that these are not coaxed.
   *
   * The `AIRequest` row is already written in every case, so the failure is
   * visible in /admin/ai-usage whether or not it is retried.
   */
  if (outcome.errorCode === "PROVIDER_UNAVAILABLE") {
    log.warn(
      { feature: data.feature, errorCode: outcome.errorCode },
      "ai provider unavailable — retrying",
    );
    throw new Error(`AI provider unavailable: ${outcome.message}`);
  }

  log.info(
    { feature: data.feature, errorCode: outcome.errorCode },
    "ai job produced no output",
  );
  return { status: "skipped", errorCode: outcome.errorCode };
}

/**
 * Builds the context for whichever feature the job names.
 *
 * ⚠️ THE WORKER BUILDS ITS OWN CONTEXT RATHER THAN RECEIVING ONE IN THE JOB
 * PAYLOAD. Two reasons. A serialised context in Redis is a copy of tenant
 * evidence sitting outside Postgres for the queue's retention window. And a job
 * that waited an hour would explain the evidence as it was an hour ago — the
 * context must be built from the database at the moment of the call, or a
 * retry can cite rows that have since been deleted by the retention sweep.
 */
export async function buildContext(
  data: AiJobData,
): Promise<IssueContext | DriftContext | ClientMessageContext | null> {
  const repos = repositoriesFor(data.agencyId);

  if (data.feature === "EXPLAIN_ISSUE" || data.feature === "RECOMMEND_FIX") {
    const issue = await repos.db.issue.findFirst({
      where: { id: data.entityId },
      include: {
        website: { select: { registrableDomain: true } },
        evidence: { orderBy: { confidence: "desc" }, take: 24 },
      },
    });
    if (!issue) return null;

    const evidence = issue.evidence.filter((row) => row.scanId === issue.lastScanId);
    // ⚠️ NO EVIDENCE MEANS NO CALL. `evidence_refs` is `.min(1)` and grounding
    // checks against the supplied set, so a context with an empty evidence
    // array can only produce a response that fails validation — at full price.
    if (evidence.length === 0) return null;

    const scan = await repos.db.scan.findFirst({
      where: { id: issue.lastScanId },
      select: { detectedCmpName: true },
    });

    return buildIssueContext({
      issue: {
        ruleId: issue.ruleId,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        confidence: issue.confidence,
        firstDetectedAt: issue.firstDetectedAt,
        occurrenceCount: issue.occurrenceCount,
      },
      evidence: evidence.map((row) => ({
        id: row.id,
        kind: row.kind,
        consentPhase: row.consentPhase,
        observedAtMs: row.observedAtMs,
        pageUrl: row.pageUrl,
        confidence: row.confidence,
        payload: row.payload,
      })),
      site: {
        registrableDomain: issue.website.registrableDomain,
        cmp: scan?.detectedCmpName ?? null,
      },
      history: {
        previousScanStatus:
          issue.occurrenceCount > 1 ? "same_issue" : "no_previous",
        daysSinceFirstDetected: Math.max(
          0,
          Math.floor(
            (Date.now() - issue.firstDetectedAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        ),
      },
    });
  }

  if (data.feature === "SUMMARIZE_DRIFT") {
    const website = await repos.db.website.findFirst({
      where: { id: data.entityId },
      select: { registrableDomain: true },
    });
    if (!website) return null;

    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await repos.db.privacyDriftEvent.findMany({
      where: { websiteId: data.entityId, detectedAt: { gte: from } },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      take: 20,
    });
    if (events.length === 0) return null;

    return buildDriftContext({
      registrableDomain: website.registrableDomain,
      from,
      to: new Date(),
      events: events.map((event) => ({
        id: event.id,
        changeType: event.changeType,
        severity: event.severity,
        subject: event.summary,
        detectedAt: event.detectedAt,
      })),
    });
  }

  /*
   * ⚠️ `CLIENT_MESSAGE` IS DELIBERATELY NOT REACHABLE FROM A JOB. It produces a
   * draft a human edits and sends (§8.5, feature doc 16); generating one with
   * nobody at the keyboard would create an unattended message whose only
   * purpose is to be read by a person who never asked for it. It stays on the
   * synchronous Server Action path.
   */
  return null;
}
