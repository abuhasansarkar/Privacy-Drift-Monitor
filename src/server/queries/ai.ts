import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  buildClientMessageContext,
  buildDriftContext,
  buildIssueContext,
  type ClientMessageContext,
  type DriftContext,
  type IssueContext,
} from "@pdm/ai";
import type { AgencyContext } from "@/server/auth/context";

/**
 * AI CONTEXT QUERIES — PLAN.md Part VIII §8.4, Phase 5 task 5.2.
 *
 * Reads the typed database fields a context builder needs, and nothing else.
 *
 * ⚠️ EVERY READ IS `agencyId`-SCOPED THROUGH `repositoriesFor`. An AI context
 * is assembled from evidence, and evidence is tenant data — the fact that it is
 * about to be summarised rather than displayed changes nothing about who may
 * see it.
 *
 * ⚠️ NOTHING HERE INFERS. If a field is unknown — no CMP detected, no tracker
 * resolvable — it is OMITTED, and the prompt tells the model to say which
 * detail would narrow the answer down. Guessing "probably WordPress" here would
 * be the deterministic layer inventing a fact for the model to repeat back with
 * confidence, which is P1 inverted.
 */

/** `null` when the issue does not exist in this agency (§6.2: 404, not 403). */
export async function buildIssueContextFor(
  ctx: AgencyContext,
  issueId: string,
): Promise<{
  context: IssueContext;
  issueId: string;
  /** Returned so the caller can enforce §6.2's website scope on the ISSUE's
   *  site — the link only exists once the row has been read. */
  websiteId: string;
} | null> {
  const repos = repositoriesFor(ctx.agencyId);

  const issue = await repos.db.issue.findFirst({
    where: { id: issueId },
    include: {
      website: {
        select: { id: true, registrableDomain: true },
      },
      /*
       * ⚠️ EVIDENCE FROM THE ISSUE'S LATEST SCAN ONLY. An issue accumulates
       * evidence across every scan that saw it, and citing a request recorded
       * three weeks ago to explain today's finding would be technically
       * grounded and practically misleading. `@pdm/ai` then cuts this to the 8
       * highest-confidence rows (§8.4).
       */
      evidence: {
        orderBy: [{ confidence: "desc" }, { observedAtMs: "asc" }],
        take: 24,
      },
    },
  });
  if (!issue) return null;

  const latestScanId = issue.lastScanId;
  const evidence = issue.evidence.filter((row) => row.scanId === latestScanId);

  const scan = await repos.db.scan.findFirst({
    where: { id: latestScanId },
    select: { id: true, detectedCmpName: true, finishedAt: true },
  });

  /*
   * The tracker, resolved by joining this scan's detections to the hosts the
   * evidence actually names.
   *
   * ⚠️ A JOIN THROUGH RECORDED DATA, NOT A GUESS. `Issue` stores no vendor id
   * (the rule engine's `Finding.subject` is not persisted), so the alternative
   * was to parse a vendor out of the fingerprint — which is a hash, or to let
   * the model infer one from a domain — which is P1 inverted. If no detection
   * matches, `tracker` is omitted and the model works from the evidence alone.
   */
  const detections = await repos.db.trackerDetection.findMany({
    where: { scanId: latestScanId, vendorId: { not: null } },
    include: {
      vendor: { select: { name: true, category: true, vendorCompany: true } },
    },
    orderBy: { confidence: "desc" },
  });

  const evidenceHosts = new Set(
    evidence
      .map((row) => hostOf(row.payload))
      .filter((host): host is string => host !== null),
  );

  const matched = detections.find((detection) => {
    const summary = detection.evidenceSummary as { hosts?: unknown } | null;
    const hosts = Array.isArray(summary?.hosts) ? summary.hosts : [];
    return hosts.some(
      (host) => typeof host === "string" && evidenceHosts.has(host),
    );
  });

  const daysSinceFirstDetected = Math.max(
    0,
    Math.floor(
      (Date.now() - issue.firstDetectedAt.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  const context = buildIssueContext({
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
    ...(matched?.vendor
      ? {
          tracker: {
            name: matched.vendor.name,
            category: matched.vendor.category,
            vendorCompany: matched.vendor.vendorCompany,
          },
        }
      : {}),
    site: {
      registrableDomain: issue.website.registrableDomain,
      // ⚠️ CMS DETECTION DOES NOT EXIST. §8.4's `IssueContext.cms` is "detected
      // from generator meta / known paths", and the scanner records no such
      // field — Part IV specifies it, Phase 2 did not build it. Omitted rather
      // than faked; `RECOMMEND_FIX_V1` already handles an unknown CMS by saying
      // which detail would narrow the steps down.
      cmp: scan?.detectedCmpName ?? null,
    },
    history: {
      previousScanStatus: issue.occurrenceCount > 1 ? "same_issue" : "no_previous",
      daysSinceFirstDetected,
    },
  });

  return { context, issueId: issue.id, websiteId: issue.website.id };
}

/** The host an evidence payload names, if it names one. */
function hostOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.url === "string") {
    try {
      return new URL(record.url).host;
    } catch {
      return null;
    }
  }
  // A cookie's domain carries a leading dot; detections record bare hosts.
  if (typeof record.domain === "string") return record.domain.replace(/^\./, "");
  return null;
}

export async function buildDriftContextFor(
  ctx: AgencyContext,
  websiteId: string,
  days = 7,
): Promise<{ context: DriftContext; eventCount: number } | null> {
  const repos = repositoriesFor(ctx.agencyId);

  const website = await repos.db.website.findFirst({
    where: { id: websiteId },
    select: { id: true, registrableDomain: true, healthScore: true },
  });
  if (!website) return null;

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await repos.db.privacyDriftEvent.findMany({
    where: { websiteId, detectedAt: { gte: from } },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    take: 20,
  });

  // ⚠️ NO EVENTS MEANS NO SUMMARY, and no provider call. `events_referenced` is
  // `.min(1)`, so a summary of nothing is structurally impossible — asking for
  // one would spend a credit to receive a guaranteed validation failure.
  if (events.length === 0) return null;

  const context = buildDriftContext({
    registrableDomain: website.registrableDomain,
    from,
    to: new Date(),
    events: events.map((event) => ({
      id: event.id,
      changeType: event.changeType,
      severity: event.severity,
      // `summary` is the drift engine's own one-line description of the
      // change — rule-authored and deterministic, which is exactly what the
      // model may restate. There is no separate `subject` column.
      subject: event.summary,
      detectedAt: event.detectedAt,
    })),
  });

  return { context, eventCount: events.length };
}

export async function buildClientMessageContextFor(
  ctx: AgencyContext,
  input: {
    websiteId: string;
    issueIds: string[];
    tone: ClientMessageContext["tone"];
    fixInProgress: boolean;
  },
): Promise<ClientMessageContext | null> {
  const repos = repositoriesFor(ctx.agencyId);

  const website = await repos.db.website.findFirst({
    where: { id: input.websiteId },
    select: { id: true, registrableDomain: true },
  });
  if (!website) return null;

  const issues = await repos.db.issue.findMany({
    // ⚠️ SCOPED TO THE WEBSITE AS WELL AS THE IDS. An id list from a form is
    // user input; without `websiteId` a caller could name issues from a
    // different site in the same agency and get them summarised under this
    // client's name. In-tenant, and still the wrong client's email.
    where: { id: { in: input.issueIds }, websiteId: input.websiteId },
    orderBy: { severity: "asc" },
    take: 5,
    select: { ruleId: true, severity: true, title: true, message: true },
  });
  if (issues.length === 0) return null;

  return buildClientMessageContext({
    registrableDomain: website.registrableDomain,
    tone: input.tone,
    fixInProgress: input.fixInProgress,
    issues,
  });
}
