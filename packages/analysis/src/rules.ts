import { CONSENT_RULES } from "./rules/consent";
import { DRIFT_RULES } from "./rules/drift";
import { EXTRA_RULES } from "./rules/extra";
import { HYGIENE_RULES } from "./rules/hygiene";
import { R026, R027, R028, R030 } from "./rules/jurisdictions";
import { R031, R032, R033 } from "./rules/us-compliance";
import { R034, R035, R049 } from "./rules/policy-compliance";
import { R036, R037 } from "./rules/cipa-wiretap";
import {
  R029,
  R038,
  R039,
  R040,
  R041,
  R042,
  R043,
  R044,
  R045,
  R046,
  R047,
  R048,
} from "./rules/advanced";
import { CONSENT_MODE_RULES, R_X03, R_X04 } from "./rules/consent-mode";
import { logger } from "@pdm/shared/logger";
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

export const JURISDICTION_RULES: readonly Rule[] = [R026, R027, R028, R030];
export const US_COMPLIANCE_RULES: readonly Rule[] = [R031, R032, R033];
export const POLICY_RULES: readonly Rule[] = [R034, R035, R049];
export const CIPA_WIRETAP_RULES: readonly Rule[] = [R036, R037];
export const ADVANCED_RULES: readonly Rule[] = [
  R029,
  R038,
  R039,
  R041,
  R042,
  R043,
  R044,
  R045,
  R046,
  R047,
  R048,
];
export { CONSENT_MODE_RULES, R_X03, R_X04 };

/**
 * Ids that are DELIBERATELY NOT IMPLEMENTED, and the evidence each one would
 * need first.
 *
 * ⚠️ PDM-R050's detector does not exist. Its trigger (`errorCode ===
 * "BOT_CHALLENGE"`) is produced by nothing in the pipeline, and its rationale
 * described geo-proxy infrastructure we do not operate. A rule whose input can
 * never arrive is registered-unfireable, which is a defect — not a placeholder.
 * The rule implementation itself stays in `rules/advanced.ts`, exported, so the
 * reserved id refers to a concrete future implementation.
 */
export const RESERVED_RULE_IDS: Readonly<Record<string, string>> = {
  "PDM-R050":
    "Needs a bot-challenge fact source: no pipeline stage currently emits the " +
    "BOT_CHALLENGE error code the rule reads. Implement the detector first.",
} as const;

/**
 * Rules that are implemented and correct but cannot fire until a fact SOURCE
 * exists. A dormant rule stays OUT of `SCAN_RULES` — it is not counted as live
 * and cannot fire — but keeps its implementation, so un-dormanting it is moving
 * one id back into the registry once its input is wired.
 *
 * ⚠️ PDM-R040 NEEDS A GEOIP RESOLVER. `NetworkRequest.destinationCountry` is
 * only written when `resolveDestinationCountry` runs with a real data source
 * (self-hosted MaxMind GeoLite2 or equivalent). No resolver is wired, the
 * column is null on every row, and the rule's previous behaviour — a
 * hard-coded fallback that answered "US" for every address — published
 * fabricated cross-border findings on virtually every scan (F-003). It reads
 * only resolved countries; wire the resolver, move the id back into
 * `ADVANCED_RULES`, and the contract tests below keep the inventory honest
 * either way.
 */
export const DORMANT_RULE_IDS: Readonly<Record<string, string>> = {
  "PDM-R040":
    "Needs a real GeoIP data source behind resolveDestinationCountry " +
    "(self-hosted, e.g. MaxMind GeoLite2). Without one the destination-country " +
    "column is null and the rule must not fire — never guess a country (P1/P6).",
} as const;

/**
 * Implemented rules that are NOT registered — the reserved and dormant ones.
 * The contract test asserts these are disjoint from `RULES` and that every id
 * in either list is implemented by a real rule object.
 */
export const UNREGISTERED_RULES: readonly Rule[] = [R040];

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
    } catch (err) {
      /*
       * ⚠️ A BROKEN RULE MUST NOT FAIL THE ANALYSIS. The other rules still hold
       * real findings, and losing them because one predicate threw would turn a
       * tuning mistake into a scan that reports nothing — which looks exactly
       * like a clean site.
       */
      logger.warn({ ruleId: rule.id, err }, "rule threw during evaluation");
      return [];
    }
  });

  return applyPrecedence(findings, rules);
}

/** Second pass — see the two-pass note above. */
export function evaluateDriftRules(context: RuleContext): Finding[] {
  return evaluateRules(context, DRIFT_RULES);
}
