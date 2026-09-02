import type {
  ConsentPhase,
  PhaseResult,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
} from "@pdm/scanner/types";
import type { Detection, VendorPattern } from "../classify";

/**
 * RULE TYPES — PLAN.md Part IV §4.11.
 *
 * ⚠️ A RULE MAY ONLY READ. It cannot fetch, cannot infer that something
 * happened, and cannot upgrade its own severity beyond what the evidence
 * supports. Every finding carries `evidenceRefs` pointing at the rows it was
 * derived from — a finding whose references do not resolve is a bug, not a
 * softer finding (P2/P6).
 *
 * ⚠️ A PHASE THAT DID NOT RUN PRODUCES NO FINDINGS FROM ITS ABSENCE. If Reject
 * All was UNDETERMINED, the correct output is nothing — not "no trackers after
 * rejection". That silence is what `PARTIAL` communicates instead (P5), and
 * rules must never fill it.
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
  | "TRANSPORT_SECURITY"
  | "US_CCPA"
  | "FTC_COMPLIANCE"
  | "CIPA_WIRETAP"
  | "CLOAKING"
  | "STORAGE"
  | "TRANSPORT"
  | "CMP_HYGIENE"
  | "INTERACTION"
  | "TAG_MANAGER"
  | "FINGERPRINT"
  | "PERFORMANCE"
  | "SECURITY"
  | "POLICY"
  | "EU_GERMANY"
  | "EU_FRANCE"
  | "EU_ITALY"
  | "UK_PECR";

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
  /**
   * §4.11's "Recommended action" column, rule-authored.
   *
   * ⚠️ NEVER AI-GENERATED (P1/P2). An issue must read identically every time it
   * is opened; AI explanation is an additive layer on top of this text.
   */
  recommendedAction: string;
}

/**
 * Scan-level facts §4.11 needs that are not evidence rows.
 *
 * ⚠️ These come from the SCAN RECORD, not from a rule's own inference. R023 in
 * particular must not count failures itself — a rule that queried would be a
 * rule that can produce a fact, which P6 forbids.
 */
export interface ScanFacts {
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED" | "QUEUED" | "RUNNING";
  errorCode: string | null;
  /** The canonical monitored URL, for the transport rules. */
  url: string;
  /** From `Website.consecutiveFailures`, maintained by the scan pipeline. */
  consecutiveFailures: number;
  /** `null` when no consent platform was detected. */
  cmpId: string | null;
  cmpName: string | null;
}

/**
 * Drift events, already computed.
 *
 * ⚠️ DRIFT RULES RUN IN A SECOND PASS, after `recordDrift`. Folding them into
 * the first pass would mean the rule engine computing drift itself — which
 * would duplicate the diff, and would let a rule disagree with the drift feed
 * about what changed.
 */
export interface DriftFact {
  changeType: string;
  severity: Severity;
  summary: string;
  /** Vendor name, cookie name or domain — whatever the change is about. */
  subject: string;
  /** True when the change was observed in the NO_CONSENT phase. */
  preConsent: boolean;
}

export interface RuleContext {
  phases: readonly PhaseResult[];
  detections: readonly Detection[];
  vendorsById: ReadonlyMap<string, VendorPattern>;
  requests: readonly RecordedRequest[];
  cookies: readonly RecordedCookie[];
  storage: readonly RecordedStorageEntry[];
  /** Optional so evidence-only rules stay testable without a scan record. */
  scan?: ScanFacts;
  drift?: readonly DriftFact[];
}

export interface Rule {
  /** The §4.11 identifier. Stored on every issue — changing one orphans issues. */
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
export function executed(context: RuleContext, phase: ConsentPhase): boolean {
  return context.phases.some(
    (candidate) => candidate.phase === phase && candidate.status === "EXECUTED",
  );
}

export function phaseOf(
  context: RuleContext,
  phase: ConsentPhase,
): PhaseResult | undefined {
  return context.phases.find((candidate) => candidate.phase === phase);
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

export function vendorName(context: RuleContext, detection: Detection): string {
  if (detection.vendorId) {
    return context.vendorsById.get(detection.vendorId)?.name ?? detection.vendorId;
  }
  return detection.unknownDomain ?? "unknown third party";
}

/**
 * Marketing/advertising versus analytics — the split §4.11 uses to separate
 * R001 from R002 and R004 from R005.
 *
 * ⚠️ AN UNKNOWN CATEGORY IS TREATED AS ANALYTICS, not marketing. Marketing
 * carries the Critical severity, and guessing upward on a vendor we have not
 * categorised is exactly the wrong-Critical that costs an agency's trust.
 */
export function isMarketing(vendor: VendorPattern | undefined): boolean {
  return vendor?.category === "MARKETING" || vendor?.category === "ADVERTISING";
}

export function isEssential(vendor: VendorPattern | undefined): boolean {
  return Boolean(vendor?.isEssentialCandidate);
}

export const NO_EVIDENCE = {
  requestUrls: [] as string[],
  cookieNames: [] as string[],
  storageKeys: [] as string[],
};
