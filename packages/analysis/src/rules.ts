import { CONSENT_RULES } from "./rules/consent";
import { DRIFT_RULES } from "./rules/drift";
import { EXTRA_RULES } from "./rules/extra";
import { HYGIENE_RULES } from "./rules/hygiene";
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

/** Everything that can be decided from one scan's evidence. */
export const SCAN_RULES: readonly Rule[] = [
  ...CONSENT_RULES,
  ...HYGIENE_RULES,
  ...EXTRA_RULES,
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
