import { CONSENT_RULES } from "./rules/consent";
import { DRIFT_RULES } from "./rules/drift";
import { EXTRA_RULES } from "./rules/extra";
import { HYGIENE_RULES } from "./rules/hygiene";
import { R026, R027, R028, R030 } from "./rules/jurisdictions";
import { R031, R032, R033 } from "./rules/us-compliance";
import { R034, R035, R049 } from "./rules/policy-compliance";
import { R036, R037 } from "./rules/cipa-wiretap";
import {
  R038,
  R039,
  R042,
  R044,
  R046,
  R047,
  R048,
  R050,
} from "./rules/advanced";
import { CONSENT_MODE_RULES, R051, R052 } from "./rules/consent-mode";
import type { Finding, Rule, RuleContext } from "./rules/types";

/**
 * RULE ENGINE — PLAN.md Part IV §4.11, Phase 3 task 3.3.
 *
 * Turns recorded evidence into findings. Rules are DATA plus a predicate, held
 * in a registry, so tuning a rule is a change to one declaration and a replay
 * over stored evidence — not a rewrite of a branch buried in a pipeline (§4.14).
 *
 * ⚠️ THE RULE IDS ARE §4.11's, AND THEY ARE A CONTRACT. Every issue row stores
 * `ruleId`; renaming one orphans every issue derived from it, and breaks the
 * "trace a finding to the rule that produced it" property the evidence system
 * rests on (P2). `PDM-X…` ids are ours — see `rules/extra.ts`.
 *
 * ⚠️ TWO PASSES, NOT ONE. Evidence rules run immediately after a scan; drift
 * rules run after the drift engine has produced its events, because they must
 * describe the same change the drift feed shows. Running them together would
 * mean the rule engine diffing scans itself.
 *
 * ⚠️ A REGISTERED RULE MUST BE ABLE TO FIRE. Five ids were registered with an
 * `evaluate()` that returned `[]` unconditionally — R029, R040, R041, R043 and
 * R045 — each under a comment describing behaviour it did not have. They were
 * counted in "50 rules", shown in the admin catalogue, and could never produce
 * a finding. `RESERVED_RULE_IDS` below replaces them: the id stays reserved so
 * it is never reused for something else, and the reason it cannot be built yet
 * is written down next to it. `rules.test.ts` asserts the registry and the
 * reserved list are disjoint and together cover PDM-R001…R050 with no gaps.
 */

export type {
  DriftFact,
  Finding,
  IssueCategory,
  Rule,
  RuleContext,
  ScanFacts,
  Severity,
} from "./rules/types";
export { fingerprint } from "./rules/types";

export const JURISDICTION_RULES: readonly Rule[] = [R026, R027, R028, R030];
export const US_COMPLIANCE_RULES: readonly Rule[] = [R031, R032, R033];
export const POLICY_RULES: readonly Rule[] = [R034, R035, R049];
export const CIPA_WIRETAP_RULES: readonly Rule[] = [R036, R037];
export const ADVANCED_RULES: readonly Rule[] = [
  R038,
  R039,
  R042,
  R044,
  R046,
  R047,
  R048,
  R050,
];
export { CONSENT_MODE_RULES, R051, R052 };

/**
 * Ids that are DELIBERATELY NOT IMPLEMENTED, and the evidence each one would
 * need first.
 *
 * ⚠️ RESERVED, NOT AVAILABLE. Nothing may reuse these ids for a different rule:
 * `Issue.ruleId` is a stored contract (§4.11), and an id that once meant
 * "fingerprinting" must never come to mean something else.
 *
 * Each of these needs a fact the scanner does not record. Recording it is the
 * work — writing the predicate is the easy half, which is exactly why these
 * shipped as empty predicates that looked finished.
 */
export const RESERVED_RULE_IDS: Readonly<Record<string, string>> = {
  /** Needs DOM interaction facts: scroll-lock, backdrop, focus trap. */
  "PDM-R029": "Cookie wall / forcible gating — requires recorded DOM gating state",
  /** Needs geo-IP of the request DESTINATION; we record egress region, not destination country. */
  "PDM-R040":
    "Cross-border PII exfiltration — requires destination-country resolution per request",
  /** Needs rendered geometry of the accept and reject controls. */
  "PDM-R041":
    "Asymmetric button sizing — requires recorded bounding boxes for consent controls",
  /** Needs the scanner to submit a form; the INTERACTIVE_ACTION phase does not. */
  "PDM-R043":
    "Form submission tracker trigger — requires a form-submission step in the interactive phase",
  /** Needs JS API instrumentation (canvas/WebGL/AudioContext call interception). */
  "PDM-R045":
    "Canvas / WebGL / audio fingerprinting — requires JS API call instrumentation",
} as const;

/**
 * Rules that are implemented but cannot fire until a fact SOURCE exists.
 *
 * Phase 14 activates Module 23 (Policy-to-Code Auditor), un-dormanting PDM-R034
 * and PDM-R049. There are currently 0 dormant rules.
 */
export const DORMANT_RULE_IDS: Readonly<Record<string, string>> = {} as const;

/** Everything that can be decided from one scan's evidence. */
export const SCAN_RULES: readonly Rule[] = [
  ...CONSENT_RULES,
  ...HYGIENE_RULES,
  ...EXTRA_RULES,
  ...JURISDICTION_RULES,
  ...US_COMPLIANCE_RULES,
  ...POLICY_RULES,
  ...CIPA_WIRETAP_RULES,
  ...ADVANCED_RULES,
  ...CONSENT_MODE_RULES,
];

/** Everything that needs the drift engine to have run first. */
export { DRIFT_RULES } from "./rules/drift";

/**
 * The full registry.
 *
 * ⚠️ Used for coverage assertions and for the admin rule catalogue, NOT as the
 * default evaluation set — evaluating drift rules with no drift context yields
 * nothing, which is correct but wasteful on every scan.
 */
export const RULES: readonly Rule[] = [...SCAN_RULES, ...DRIFT_RULES];

/**
 * Precedence: when two rules produce a finding about the SAME subject and
 * phase, the higher-precedence one wins and the other is dropped.
 *
 * ⚠️ This is what stops one behaviour becoming three issues. A tracker that
 * fires after Reject All also fired before consent and also set a cookie —
 * reporting all three as separate findings triples the count and buries the one
 * that matters.
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
  rules: readonly Rule[] = SCAN_RULES,
): Finding[] {
  const findings = rules.flatMap((rule) => {
    try {
      return rule.evaluate(context);
    } catch {
      /*
       * ⚠️ A BROKEN RULE MUST NOT FAIL THE ANALYSIS. The other rules still hold
       * real findings, and losing them because one predicate threw would turn a
       * tuning mistake into a scan that reports nothing — which looks exactly
       * like a clean site.
       */
      return [];
    }
  });

  return applyPrecedence(findings, rules);
}

/** Second pass — see the two-pass note above. */
export function evaluateDriftRules(context: RuleContext): Finding[] {
  return evaluateRules(context, DRIFT_RULES);
}
