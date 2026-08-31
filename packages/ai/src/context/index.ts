/**
 * CONTEXT BUILDERS — PLAN.md Part VIII §8.4, Phase 5 task 5.2.
 *
 * ⚠️ THE RULE: NEVER SEND RAW SCAN DATA. A scan produces megabytes; the model
 * needs a few hundred tokens of structured facts. §8.4's worked example is
 * ≈300 tokens against 200k+ of raw evidence — a 600× reduction that is
 * simultaneously the cost control (§8.9) and the injection defense (§8.8).
 *
 * ⚠️ THESE TYPES ARE THE MODEL'S ENTIRE WORLD. A field that is not here cannot
 * be referenced by an output, because `validate.ts` checks every citation
 * against what was supplied. So the shape below is not a convenience DTO — it
 * is the boundary that makes "AI explains evidence, AI never invents it"
 * mechanically true rather than aspirational. Adding a field widens what the
 * model may assert; removing one narrows it. Treat changes here as changes to
 * the product's safety envelope.
 *
 * Everything that could have come from a scanned site passes through
 * `./redact.ts` on the way in.
 */

import {
  cookieSummary,
  redactUrl,
  requestSummary,
  sanitize,
  storageSummary,
} from "./redact";

export {
  cookieSummary,
  redactUrl,
  requestSummary,
  sanitize,
  storageSummary,
};

/** §8.4 caps the evidence array at 8, highest-confidence first. */
export const MAX_EVIDENCE_ITEMS = 8;
/** §8.5 feature 3: up to 20 drift events. */
export const MAX_DRIFT_EVENTS = 20;
/** §8.5 feature 4: 1–5 issues per client message. */
export const MAX_MESSAGE_ISSUES = 5;

export type EvidenceKindName =
  | "NETWORK_REQUEST"
  | "COOKIE"
  | "STORAGE_ENTRY"
  | "SCREENSHOT"
  | "CONSOLE_ERROR"
  | "CONSENT_ACTION"
  | "DRIFT_DIFF";

export type ConsentPhaseName =
  | "NO_CONSENT"
  | "REJECT_ALL"
  | "ACCEPT_ALL"
  | "WITHDRAW";

export type SeverityName = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/** One redacted evidence row. `ref` is the grounding anchor (§8.4). */
export interface EvidenceContextItem {
  /** `IssueEvidence.id`. The only id the model is allowed to cite. */
  ref: string;
  kind: EvidenceKindName;
  consentPhase: ConsentPhaseName;
  observedAtMs: number;
  /** Pre-redacted one-liner: 'GET host/path → 200 (initiator: gtm.js)'. */
  summary: string;
}

/** §8.4 — the input to `EXPLAIN_ISSUE` and `RECOMMEND_FIX`. */
export interface IssueContext {
  issue: {
    ruleId: string;
    severity: SeverityName;
    category: string;
    /** Deterministic rule text. The model rephrases it; it never replaces it. */
    message: string;
    confidence: number;
    firstDetectedAt: string;
    occurrenceCount: number;
  };
  evidence: EvidenceContextItem[];
  tracker?: {
    name: string;
    category: string;
    vendorCompany?: string;
  };
  site: {
    cms?: string;
    cmp?: string;
    /** ⚠️ registrable domain, NOT the full URL (§8.4). */
    registrableDomain: string;
  };
  history: {
    previousScanStatus:
      | "clean"
      | "same_issue"
      | "different_issues"
      | "no_previous";
    driftChangeType?: string;
    daysSinceFirstDetected: number;
  };
}

/** §8.5 feature 3 — the input to `SUMMARIZE_DRIFT`. */
export interface DriftContext {
  site: { registrableDomain: string };
  period: { fromIso: string; toIso: string };
  events: Array<{
    /** `PrivacyDriftEvent.id`. The grounding anchor for this feature. */
    ref: string;
    changeType: string;
    severity: SeverityName;
    /** Redacted subject: a vendor name, a cookie name, a host. */
    subject: string;
    beforeCount?: number;
    afterCount?: number;
    detectedAtIso: string;
  }>;
  scoreDelta?: { before: number; after: number };
}

/** §8.5 feature 4 — the input to `CLIENT_MESSAGE`. */
export interface ClientMessageContext {
  site: { registrableDomain: string };
  /**
   * ⚠️ AN ENUM, NOT FREE TEXT. §8.8 ("prompt injection via user input"):
   * user-supplied free text is enum-constrained or excluded from prompts. Tone
   * is the one thing the user picks, so it is the one thing that must not be a
   * string the user typed.
   */
  tone: "reassuring" | "factual" | "urgent";
  fixInProgress: boolean;
  issues: Array<{
    ruleId: string;
    severity: SeverityName;
    /** Deterministic rule title/message — never user notes. */
    title: string;
    message: string;
    /** Redacted subject line for the finding. */
    subject?: string;
  }>;
}

/**
 * Raw rows as the caller reads them from Prisma. Declared structurally so
 * `packages/ai` never imports the generated client and stays testable with no
 * database — the same constraint `packages/scanner` lives under.
 */
export interface RawEvidenceRow {
  id: string;
  kind: string;
  consentPhase: string;
  observedAtMs: number;
  pageUrl: string;
  confidence: number;
  payload: unknown;
}

export interface RawIssueRow {
  ruleId: string;
  severity: string;
  category: string;
  message: string;
  confidence: number;
  firstDetectedAt: Date;
  occurrenceCount: number;
}

/**
 * Turns one recorded evidence row into its redacted one-liner.
 *
 * ⚠️ THE PAYLOAD IS READ DEFENSIVELY AND NEVER SPREAD. `payload` is `Json` in
 * Prisma and originates, field by field, from a scanned site. Picking named
 * fields (and redacting each) is what stops an unexpected key — a response
 * header, an inline script fragment — from riding into the prompt because
 * somebody added it to the collector months later.
 */
export function summariseEvidence(row: RawEvidenceRow): string {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const str = (key: string): string | undefined =>
    typeof payload[key] === "string" ? (payload[key] as string) : undefined;
  const num = (key: string): number | undefined =>
    typeof payload[key] === "number" ? (payload[key] as number) : undefined;
  const bool = (key: string): boolean | undefined =>
    typeof payload[key] === "boolean" ? (payload[key] as boolean) : undefined;

  switch (row.kind) {
    case "NETWORK_REQUEST":
      return requestSummary({
        method: str("method") ?? "GET",
        url: str("url") ?? row.pageUrl,
        status: num("status") ?? null,
        initiator: str("initiator") ?? null,
      });
    case "COOKIE":
      return cookieSummary({
        name: str("name") ?? "(unnamed)",
        domain: str("domain") ?? "",
        maxAgeDays: num("maxAgeDays") ?? null,
        httpOnly: bool("httpOnly") ?? null,
        thirdParty: bool("thirdParty") ?? null,
      });
    case "STORAGE_ENTRY":
      return storageSummary({
        storageType: str("storageType") ?? "storage",
        key: str("key") ?? "(unnamed)",
        origin: str("origin") ?? redactUrl(row.pageUrl),
      });
    case "CONSENT_ACTION":
      return `Consent action "${sanitize(str("action") ?? "unknown", 60)}" on ${redactUrl(row.pageUrl)}`;
    case "CONSOLE_ERROR":
      return `Console error on ${redactUrl(row.pageUrl)}: ${sanitize(str("message") ?? "", 160)}`;
    case "DRIFT_DIFF":
      return `Change of type ${sanitize(str("changeType") ?? "unknown", 48)} on ${redactUrl(row.pageUrl)}`;
    case "SCREENSHOT":
      // ⚠️ The image itself is never sent — the model is text-only here, and a
      // screenshot can contain anything the page rendered, including PII.
      return `Screenshot recorded on ${redactUrl(row.pageUrl)}`;
    default:
      return `Evidence recorded on ${redactUrl(row.pageUrl)}`;
  }
}

/**
 * Selects the evidence the model may see: highest-confidence first, capped at
 * `MAX_EVIDENCE_ITEMS`.
 *
 * ⚠️ TRUNCATION IS THE TOKEN BUDGET'S ONLY LEVER (§8.9: "hard token budget of
 * 1,500 input tokens per call, enforced by truncating the evidence array
 * (highest-confidence retained)"). Sorting by confidence — with observation
 * time as the tie-break so the cut is deterministic and the same context hashes
 * to the same `inputHash` on every build — is what makes the truncation safe:
 * what is dropped is always the weakest evidence, never a random eight.
 */
export function selectEvidence(
  rows: RawEvidenceRow[],
  limit = MAX_EVIDENCE_ITEMS,
): EvidenceContextItem[] {
  return [...rows]
    .sort((a, b) => b.confidence - a.confidence || a.observedAtMs - b.observedAtMs)
    .slice(0, limit)
    .map((row) => ({
      ref: row.id,
      kind: row.kind as EvidenceKindName,
      consentPhase: row.consentPhase as ConsentPhaseName,
      observedAtMs: row.observedAtMs,
      summary: summariseEvidence(row),
    }));
}

export interface BuildIssueContextInput {
  issue: RawIssueRow;
  evidence: RawEvidenceRow[];
  tracker?: { name: string; category: string; vendorCompany?: string | null };
  site: {
    cms?: string | null;
    cmp?: string | null;
    registrableDomain: string;
  };
  history: IssueContext["history"];
  /** Injected so the same inputs build the same context in a test. */
  now?: Date;
}

export function buildIssueContext(input: BuildIssueContextInput): IssueContext {
  const ctx: IssueContext = {
    issue: {
      ruleId: input.issue.ruleId,
      severity: input.issue.severity as SeverityName,
      category: input.issue.category,
      message: sanitize(input.issue.message, 600),
      confidence: round2(input.issue.confidence),
      firstDetectedAt: input.issue.firstDetectedAt.toISOString(),
      occurrenceCount: input.issue.occurrenceCount,
    },
    evidence: selectEvidence(input.evidence),
    site: {
      registrableDomain: sanitize(input.site.registrableDomain, 120),
    },
    history: input.history,
  };

  // ⚠️ Optional keys are OMITTED, never set to undefined or null. The context
  // is canonicalised into the cache key (§8.9), and `{cms: undefined}` and `{}`
  // must not hash differently — that would silently halve the cache hit rate.
  if (input.tracker) {
    ctx.tracker = {
      name: sanitize(input.tracker.name, 120),
      category: input.tracker.category,
      ...(input.tracker.vendorCompany
        ? { vendorCompany: sanitize(input.tracker.vendorCompany, 120) }
        : {}),
    };
  }
  if (input.site.cms) ctx.site.cms = sanitize(input.site.cms, 60);
  if (input.site.cmp) ctx.site.cmp = sanitize(input.site.cmp, 60);

  return ctx;
}

export interface BuildDriftContextInput {
  registrableDomain: string;
  from: Date;
  to: Date;
  events: Array<{
    id: string;
    changeType: string;
    severity: string;
    subject: string;
    beforeCount?: number | null;
    afterCount?: number | null;
    detectedAt: Date;
  }>;
  scoreDelta?: { before: number; after: number };
}

export function buildDriftContext(input: BuildDriftContextInput): DriftContext {
  const ctx: DriftContext = {
    site: { registrableDomain: sanitize(input.registrableDomain, 120) },
    period: { fromIso: input.from.toISOString(), toIso: input.to.toISOString() },
    events: input.events.slice(0, MAX_DRIFT_EVENTS).map((event) => {
      const item: DriftContext["events"][number] = {
        ref: event.id,
        changeType: event.changeType,
        severity: event.severity as SeverityName,
        subject: sanitize(event.subject, 120),
        detectedAtIso: event.detectedAt.toISOString(),
      };
      if (typeof event.beforeCount === "number") item.beforeCount = event.beforeCount;
      if (typeof event.afterCount === "number") item.afterCount = event.afterCount;
      return item;
    }),
  };
  if (input.scoreDelta) ctx.scoreDelta = input.scoreDelta;
  return ctx;
}

export interface BuildClientMessageContextInput {
  registrableDomain: string;
  tone: ClientMessageContext["tone"];
  fixInProgress: boolean;
  issues: Array<{
    ruleId: string;
    severity: string;
    title: string;
    message: string;
    subject?: string | null;
  }>;
}

export function buildClientMessageContext(
  input: BuildClientMessageContextInput,
): ClientMessageContext {
  return {
    site: { registrableDomain: sanitize(input.registrableDomain, 120) },
    tone: input.tone,
    fixInProgress: input.fixInProgress,
    issues: input.issues.slice(0, MAX_MESSAGE_ISSUES).map((issue) => ({
      ruleId: issue.ruleId,
      severity: issue.severity as SeverityName,
      title: sanitize(issue.title, 200),
      message: sanitize(issue.message, 600),
      ...(issue.subject ? { subject: sanitize(issue.subject, 120) } : {}),
    })),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The set of ids an output is allowed to cite, for whichever context it was
 * built from. `validate.ts` calls this rather than reaching into a context
 * shape, so a new feature cannot forget to expose its anchors and silently
 * ground against an empty set.
 */
export function groundingIdsOf(
  context: IssueContext | DriftContext | ClientMessageContext,
): Set<string> {
  if ("evidence" in context) return new Set(context.evidence.map((e) => e.ref));
  if ("events" in context) return new Set(context.events.map((e) => e.ref));
  return new Set();
}
