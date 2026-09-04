import type { PhaseResult } from "@pdm/scanner/types";
import type { Finding, Severity } from "./rules";

/**
 * PRIVACY HEALTH SCORE — PLAN.md Part IV §4.12, Phase 3 task 3.7.
 *
 * ⚠️ THE SCORE IS EXPLAINABLE OR IT IS NOTHING. A number an agency cannot
 * defend to their client is worse than no number: they will be asked "why 64?"
 * in a meeting, and "the tool said so" ends the conversation badly. Hence a
 * DEDUCTION model — start at 100, subtract named penalties — rather than a
 * weighted formula whose output cannot be decomposed.
 *
 * ⚠️ THE BREAKDOWN MUST SUM TO THE DISPLAYED SCORE. `assertConsistent` below is
 * not a nicety: a breakdown that does not add up is the single fastest way to
 * destroy trust in every other number the product shows. It is checked here,
 * not in the UI, because the UI renders what it is given.
 *
 * ⚠️ A PARTIAL SCAN SCORES WITH `PARTIAL` CONFIDENCE, NEVER A CLEAN 100. Phases
 * that did not run cannot contribute findings, so their absence would otherwise
 * read as their being fine (P5). The score is capped and labelled instead.
 */

export type ScoreConfidence = "FULL" | "PARTIAL";

export interface ScoreComponent {
  /** Stable id so the UI can group and the drift engine can compare. */
  component: string;
  penalty: number;
  /** Rendered verbatim (§4.12) — this is the "why 64?" answer. */
  reason: string;
  /** Fingerprints of the findings that produced this penalty. */
  findingRefs: string[];
}

export interface ScoreResult {
  score: number;
  confidence: ScoreConfidence;
  breakdown: ScoreComponent[];
  /** Band for display — §11.3 colour tokens map to exactly these. */
  band: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL";
}

/**
 * Penalty per severity, per DISTINCT finding.
 *
 * Deliberately not linear in count: the difference between one and two critical
 * findings matters far less than the difference between none and one, and a
 * site with twelve Mediums should not score below a site with one Critical.
 * The caps below encode that.
 */
const PENALTY: Record<Severity, number> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 2,
  INFO: 0,
};

/** Maximum total deduction per severity, however many findings there are. */
const CAP: Record<Severity, number> = {
  CRITICAL: 50,
  HIGH: 30,
  MEDIUM: 15,
  LOW: 6,
  INFO: 0,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "informational",
};

/**
 * A scan with journeys that did not run cannot be scored as if they had.
 *
 * The ceiling is not a penalty — no finding justifies it — so it is a separate
 * component with its own reason, and it is what stops an accept-only banner
 * (fixture F10) from scoring 100 because the Reject-All rules found nothing.
 *
 * ⚠️ ZERO PHASES IS THE WORST CASE, NOT THE BEST ONE. `phases.filter(...)`
 * returns an empty array both when every journey succeeded and when no journey
 * ran at all, so a naive `incomplete.length > 0` test reports FULL confidence
 * for a scan that recorded nothing — a clean 100 for a site nobody looked at.
 * That is precisely the silent failure P4 exists to forbid, and it is invisible
 * in review because the expression reads correctly. The empty case is handled
 * separately below and is always PARTIAL.
 */
const PARTIAL_CEILING = 75;

export function bandFor(score: number): ScoreResult["band"] {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 50) return "FAIR";
  if (score >= 25) return "POOR";
  return "CRITICAL";
}

export interface ScoreInput {
  findings: readonly Finding[];
  phases: readonly PhaseResult[];
}

export function computeScore(input: ScoreInput): ScoreResult {
  const breakdown: ScoreComponent[] = [];

  const bySeverity = new Map<Severity, Finding[]>();
  for (const finding of input.findings) {
    const list = bySeverity.get(finding.severity) ?? [];
    list.push(finding);
    bySeverity.set(finding.severity, list);
  }

  // Fixed order so two scans of the same site produce the same breakdown
  // ordering — the drift engine compares these, and a reordered array would
  // read as a change.
  const order: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  for (const severity of order) {
    const findings = bySeverity.get(severity) ?? [];
    if (findings.length === 0) continue;

    const penalty = Math.min(findings.length * PENALTY[severity], CAP[severity]);
    if (penalty === 0) continue;

    breakdown.push({
      component: `severity:${severity}`,
      penalty,
      reason: `${findings.length} ${SEVERITY_LABEL[severity]} ${
        findings.length === 1 ? "potential issue" : "potential issues"
      } detected.`,
      findingRefs: findings.map((finding) => finding.fingerprint),
    });
  }

  const noPhases = input.phases.length === 0;
  const incomplete = input.phases.filter((phase) => phase.status !== "EXECUTED");
  const confidence: ScoreConfidence =
    noPhases || incomplete.length > 0 ? "PARTIAL" : "FULL";

  let score = 100 - breakdown.reduce((total, item) => total + item.penalty, 0);

  if (confidence === "PARTIAL" && score > PARTIAL_CEILING) {
    // Recorded as a component so the breakdown still sums to the score — see
    // the header note. The reason names the journeys, not a number.
    const ceiling = score - PARTIAL_CEILING;
    breakdown.push({
      component: noPhases ? "no-phases" : "incomplete-scan",
      penalty: ceiling,
      reason: noPhases
        ? "No consent journey was recorded for this scan, so this score is capped."
        : `${incomplete
            .map((phase) => phase.phase)
            .join(", ")} could not be completed, so this score is capped.`,
      findingRefs: [],
    });
    score = PARTIAL_CEILING;
  }

  score = Math.max(0, Math.min(100, score));

  const result: ScoreResult = {
    score,
    confidence,
    breakdown,
    band: bandFor(score),
  };

  assertConsistent(result);
  return result;
}

/**
 * The invariant, checked at the point of production.
 *
 * ⚠️ Throws rather than clamping. A breakdown that does not sum to the score is
 * a logic error, and quietly adjusting the number would hide it while showing
 * the user arithmetic that does not work — which is precisely the failure this
 * whole design exists to prevent.
 */
export function assertConsistent(result: ScoreResult): void {
  const deducted = result.breakdown.reduce((total, item) => total + item.penalty, 0);
  const expected = Math.max(0, Math.min(100, 100 - deducted));

  if (expected !== result.score) {
    throw new Error(
      `score breakdown does not sum to the score: 100 - ${deducted} = ${expected}, got ${result.score}`,
    );
  }
}
