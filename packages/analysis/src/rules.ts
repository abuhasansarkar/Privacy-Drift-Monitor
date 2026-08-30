import type {
  ConsentPhase,
  PhaseResult,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
} from "@pdm/scanner/types";
import type { Detection, VendorPattern } from "./classify";

/**
 * RULE ENGINE — PLAN.md Part IV §4.9, Phase 3 tasks 3.3/3.4.
 *
 * Turns recorded evidence into findings. Rules are DATA plus a predicate, held
 * in a registry, so that tuning a rule is a change to one declaration and a
 * replay over stored evidence — not a rewrite of a branch buried in a pipeline
 * (§4.14).
 *
 * ⚠️ A RULE MAY ONLY READ. It cannot fetch, cannot infer that something
 * happened, and cannot upgrade its own severity beyond what the evidence
 * supports. Every finding carries `evidenceRefs` pointing at the rows it was
 * derived from — a finding whose references do not resolve is a bug, not a
 * softer finding (P2/P6).
 *
 * ⚠️ A PHASE THAT DID NOT RUN PRODUCES NO FINDINGS FROM ITS ABSENCE. If
 * Reject All was UNDETERMINED, the correct output is nothing — not "no
 * trackers after rejection". That silence is what `PARTIAL` communicates
 * instead (P5), and rules must never fill it.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/**
 * Mirrors the Prisma `IssueCategory` enum character for character.
 *
 * ⚠️ Restated rather than imported: this package must stay usable without the
 * generated client, so the value is cast at the persistence boundary. A member
 * that drifts from the schema fails there — which is why it must match exactly.
 */
export type IssueCategory =
  | "PRE_CONSENT_TRACKING"
  | "CONSENT_FAILURE"
  | "CONSENT_MISSING"
  | "COOKIE_BEHAVIOR"
  | "NEW_TRACKER"
  | "UNKNOWN_VENDOR"
  | "DRIFT"
  | "SCAN_HEALTH"
  | "TRANSPORT_SECURITY";

export interface Finding {
  ruleId: string;
  category: IssueCategory;
  severity: Severity;
  /** Stable across scans — this is what deduplicates an issue (§3.4). */
  fingerprint: string;
  title: string;
  /** Vendor or domain the finding is about, for grouping and display. */
  subject: string;
  consentPhase: ConsentPhase;
  /** Ids of the recorded rows this was derived from. Must resolve (P2). */
  evidenceRefs: {
    requestUrls: string[];
    cookieNames: string[];
    storageKeys: string[];
  };
  /** Why this severity, in one sentence — rendered verbatim (§4.12). */
  rationale: string;
}

export interface RuleContext {
  phases: readonly PhaseResult[];
  detections: readonly Detection[];
  vendorsById: ReadonlyMap<string, VendorPattern>;
  requests: readonly RecordedRequest[];
  cookies: readonly RecordedCookie[];
  storage: readonly RecordedStorageEntry[];
}

export interface Rule {
  id: string;
  category: IssueCategory;
  /** Highest wins when two rules describe the same subject — see `applyPrecedence`. */
  precedence: number;
  evaluate(context: RuleContext): Finding[];
}

/**
 * Which phases actually ran.
 *
 * ⚠️ Every rule consults this before reasoning about a phase. A rule that
 * assumes REJECT_ALL happened will happily conclude "nothing fired after
 * rejection" from an empty array that is empty because we never clicked
 * anything.
 */
function executed(context: RuleContext, phase: ConsentPhase): boolean {
  return context.phases.some(
    (candidate) => candidate.phase === phase && candidate.status === "EXECUTED",
  );
}

/**
 * A stable fingerprint.
 *
 * ⚠️ IT MUST NOT CONTAIN ANYTHING THAT VARIES BETWEEN SCANS. No timestamps, no
 * scan id, no counts — otherwise the same finding produces a new issue every
 * night and the deduplication in §3.4 silently does nothing, which shows up as
 * an alert storm rather than as an error.
 */
export function fingerprint(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.toLowerCase())
    .join("|");
}

function nameFor(context: RuleContext, detection: Detection): string {
  if (detection.vendorId) {
    return context.vendorsById.get(detection.vendorId)?.name ?? detection.vendorId;
  }
  return detection.unknownDomain ?? "unknown third party";
}

/* ── Rules ───────────────────────────────────────────────────────────────── */

/**
 * R01 — a known tracker fired before any consent was given.
 *
 * The product's headline finding. Critical requires CORROBORATION (§4.8): a
 * single-signal match is High, because a wrong Critical is the failure mode
 * that costs an agency's trust in everything else we report.
 */
const trackerBeforeConsent: Rule = {
  id: "R01_TRACKER_BEFORE_CONSENT",
  category: "PRE_CONSENT_TRACKING",
  precedence: 100,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    return context.detections
      .filter(
        (detection) =>
          detection.consentPhase === "NO_CONSENT" && detection.vendorId !== null,
      )
      .filter((detection) => {
        const vendor = context.vendorsById.get(detection.vendorId!);
        // A CMP or bot-challenge script loading pre-consent is expected — that
        // is how the banner gets on the page at all. Reporting it as a tracking
        // finding is the fastest way to teach users to ignore us.
        return !vendor?.isEssentialCandidate;
      })
      .map((detection) => {
        const vendor = context.vendorsById.get(detection.vendorId!);
        const name = nameFor(context, detection);
        return {
          ruleId: this.id,
          category: this.category,
          severity: (detection.corroborated ? "CRITICAL" : "HIGH") as Severity,
          fingerprint: fingerprint([this.id, detection.vendorId, "NO_CONSENT"]),
          title: `Tracker detected before consent — ${name}`,
          subject: name,
          consentPhase: "NO_CONSENT" as ConsentPhase,
          evidenceRefs: {
            requestUrls: detection.evidenceSummary.hosts,
            cookieNames: detection.evidenceSummary.cookies,
            storageKeys: detection.evidenceSummary.storageKeys,
          },
          rationale: detection.corroborated
            ? `Matched on ${detection.evidenceSummary.signals.join(" and ")} — two independent signals.`
            : `Matched on ${detection.matchedVia} only. Review recommended before acting.`,
          ...(vendor ? {} : {}),
        };
      });
  },
};

/**
 * R02 — a tracker still fired AFTER the visitor rejected.
 *
 * More serious than R01 in practice: pre-consent firing is often a
 * misconfiguration, while firing after an explicit rejection means the consent
 * control does not do what it says.
 */
const trackerAfterReject: Rule = {
  id: "R02_TRACKER_AFTER_REJECT",
  category: "CONSENT_FAILURE",
  precedence: 110,
  evaluate(context) {
    // ⚠️ The load-bearing guard. Without it, an UNDETERMINED Reject All phase
    // yields zero detections and this rule reports nothing — which downstream
    // reads as "rejection is respected". It is not: we never rejected.
    if (!executed(context, "REJECT_ALL")) return [];

    return context.detections
      .filter(
        (detection) =>
          detection.consentPhase === "REJECT_ALL" && detection.vendorId !== null,
      )
      .filter((detection) => {
        const vendor = context.vendorsById.get(detection.vendorId!);
        return !vendor?.isEssentialCandidate;
      })
      .map((detection) => {
        const name = nameFor(context, detection);
        return {
          ruleId: this.id,
          category: this.category,
          severity: (detection.corroborated ? "CRITICAL" : "HIGH") as Severity,
          fingerprint: fingerprint([this.id, detection.vendorId, "REJECT_ALL"]),
          title: `Tracker detected after Reject All — ${name}`,
          subject: name,
          consentPhase: "REJECT_ALL" as ConsentPhase,
          evidenceRefs: {
            requestUrls: detection.evidenceSummary.hosts,
            cookieNames: detection.evidenceSummary.cookies,
            storageKeys: detection.evidenceSummary.storageKeys,
          },
          rationale:
            "This request was recorded after the Reject All control was used.",
        };
      });
  },
};

/** R03 — a non-essential cookie was set before consent. */
const cookieBeforeConsent: Rule = {
  id: "R03_COOKIE_BEFORE_CONSENT",
  category: "COOKIE_BEHAVIOR",
  precedence: 80,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const preConsent = context.cookies.filter(
      (cookie) => cookie.consentPhase === "NO_CONSENT",
    );
    // Group by name: the same cookie seen at three snapshot points is one
    // finding, not three.
    const byName = new Map<string, RecordedCookie>();
    for (const cookie of preConsent) byName.set(cookie.name, cookie);

    return [...byName.values()]
      // A cookie the CMP itself sets to remember the choice is the mechanism
      // working, not a finding. `valueRaw` is populated only for allowlisted
      // consent-signal cookies (§10.6), which is exactly that set.
      .filter((cookie) => cookie.valueRaw === null)
      .map((cookie) => ({
        ruleId: this.id,
        category: this.category,
        // Never Critical: a cookie alone identifies nothing. Third-party makes
        // it materially more significant than a first-party one.
        severity: (cookie.isThirdParty ? "HIGH" : "MEDIUM") as Severity,
        fingerprint: fingerprint([this.id, cookie.name, cookie.domain]),
        title: `Cookie set before consent — ${cookie.name}`,
        subject: cookie.name,
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [cookie.name],
          storageKeys: [],
        },
        rationale: cookie.isThirdParty
          ? `Set on ${cookie.domain}, a third-party domain, before any consent was given.`
          : `Set on ${cookie.domain} before any consent was given.`,
      }));
  },
};

/** R04 — storage written before consent. */
const storageBeforeConsent: Rule = {
  id: "R04_STORAGE_BEFORE_CONSENT",
  category: "COOKIE_BEHAVIOR",
  precedence: 70,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const keys = context.storage.filter(
      (entry) => entry.consentPhase === "NO_CONSENT",
    );
    if (keys.length === 0) return [];

    // One finding for the set rather than one per key: a script writing eight
    // keys is one behaviour, and eight issues would bury the other findings.
    const names = [...new Set(keys.map((entry) => entry.key))].sort();

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint([this.id, ...names]),
        title: `Storage written before consent — ${names.length} ${names.length === 1 ? "key" : "keys"}`,
        subject: names[0] ?? "storage",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: { requestUrls: [], cookieNames: [], storageKeys: names },
        rationale:
          "These browser-storage entries were written before any consent was given.",
      },
    ];
  },
};

/**
 * R05 — no consent mechanism was found at all.
 *
 * INFO, and deliberately so: plenty of sites legitimately have no banner, and
 * this rule does not judge whether one is required. It is reported because it
 * is the context a reader needs for every other finding on the page — and
 * because "we could not test consent choices here" is itself worth saying.
 */
const noConsentMechanism: Rule = {
  id: "R05_NO_CONSENT_MECHANISM",
  category: "CONSENT_MISSING",
  precedence: 10,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const rejectPhase = context.phases.find((phase) => phase.phase === "REJECT_ALL");
    if (!rejectPhase || rejectPhase.errorCode !== "CONSENT_NO_BANNER_FOUND") {
      return [];
    }

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "INFO" as Severity,
        fingerprint: fingerprint([this.id]),
        title: "No consent banner detected",
        subject: "consent mechanism",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: { requestUrls: [], cookieNames: [], storageKeys: [] },
        rationale:
          "No consent banner was found on this page, so consent choices could not be tested.",
      },
    ];
  },
};

export const RULES: readonly Rule[] = [
  trackerAfterReject,
  trackerBeforeConsent,
  cookieBeforeConsent,
  storageBeforeConsent,
  noConsentMechanism,
];

/**
 * Precedence: when two rules produce a finding about the SAME subject and
 * phase, the higher-precedence one wins and the other is dropped.
 *
 * ⚠️ This is what stops one behaviour becoming three issues. A tracker that
 * fires after Reject All also fired before consent and also set a cookie —
 * reporting all three as separate findings triples the count and buries the
 * one that matters.
 */
export function applyPrecedence(findings: Finding[], rules: readonly Rule[]): Finding[] {
  const rank = new Map(rules.map((rule) => [rule.id, rule.precedence]));
  const bySubject = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.subject}:${finding.consentPhase}`;
    const existing = bySubject.get(key);
    if (
      !existing ||
      (rank.get(finding.ruleId) ?? 0) > (rank.get(existing.ruleId) ?? 0)
    ) {
      bySubject.set(key, finding);
    }
  }

  return [...bySubject.values()];
}

export function evaluateRules(
  context: RuleContext,
  rules: readonly Rule[] = RULES,
): Finding[] {
  const findings = rules.flatMap((rule) => {
    try {
      return rule.evaluate(context);
    } catch {
      // ⚠️ A broken rule must not fail the analysis. The other rules still hold
      // real findings, and losing them because one predicate threw would turn a
      // tuning mistake into a scan that reports nothing.
      return [];
    }
  });

  return applyPrecedence(findings, rules);
}
