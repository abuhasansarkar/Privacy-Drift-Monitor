/**
 * APPROVED TERMINOLOGY — PLAN.md Part I §1.12.
 *
 * Privacy Drift Monitor is a technical monitoring service. It does not provide
 * legal advice and does not determine compliance. This vocabulary is BINDING on
 * UI copy, email templates, PDF reports, portal copy, error messages, AI system
 * prompts and test fixtures.
 *
 * This is not a style guide. Positioning the product as a compliance authority
 * is a named risk in §12.7 ("positioned as legal compliance and sued over a
 * missed issue"), and this file plus `scripts/check-terminology.ts` are the
 * mitigation.
 *
 * The FORBIDDEN list is also injected verbatim into every AI system prompt
 * (Part VIII §8.7) and re-checked on AI output, because the model will reach
 * for this language unprompted.
 */

/**
 * ⚠️ §1.12 also lists "potential consent violation" as usable *with a
 * qualifier*. It is deliberately ABSENT from this object, because the
 * enforcement mechanism cannot express "only with a qualifier": both the CI
 * grep and `findForbiddenTerms` below match the banned word as a whole word
 * regardless of what precedes it. Publishing it as an approved constant would
 * hand callers a phrase that fails the gate the moment it reaches a UI file.
 * One rule beats two that contradict each other — and AGENTS.md's table bans
 * the word outright. Use `finding` instead.
 */
export const APPROVED_TERMS = {
  finding: "potential issue",
  trackerBeforeConsent: "tracker detected before consent",
  recommendation: "review recommended",
  evidence: "technical evidence",
  observation: "observed request",
  behaviour: "detected behavior",
  service: "technical monitoring",
  legalReferral: "this may require review by your privacy advisor",
  outcomePositive: "detected",
  outcomeNegative: "not detected",
  outcomeUnknown: "could not be determined",
} as const;

/**
 * Phrases that must never reach a user.
 *
 * Matched case-insensitively as whole words by the CI check. Keep entries
 * SPECIFIC — a bare "must" would false-positive on ordinary sentences, so the
 * prescriptive forms are spelled out.
 */
export const FORBIDDEN_TERMS: readonly string[] = [
  "violation",
  "violations",
  "illegal",
  "unlawful",
  "gdpr breach",
  "data breach",
  "breach of gdpr",
  "non-compliant",
  "noncompliant",
  "compliant",
  "compliance certification",
  "certified compliant",
  "proof of non-compliance",
  "confirmed violation",
  "you must",
  "you are required to",
  "this is legal advice",
  "guaranteed compliance",
] as const;

/**
 * Contexts where a forbidden term is legitimate and the check must not fire:
 * quoting a regulation, naming the disclaimer, or describing what we do NOT do.
 *
 * A line containing this marker is skipped by the CI check.
 *
 * Deliberately ONE explicit marker. Earlier versions also allowed any line
 * mentioning `FORBIDDEN_TERMS` or `APPROVED_TERMS`, which meant a passing
 * comment reference disabled the gate for that whole line — an opt-out nobody
 * had to think about. The two files that legitimately spell the words out are
 * skipped by PATH in `scripts/check-terminology.ts` instead.
 */
export const TERMINOLOGY_ALLOW_MARKERS: readonly string[] = [
  "terminology-allow",
] as const;

/** Severity words shown to CLIENTS in the portal — plain language, never technical. */
export const PORTAL_SEVERITY_WORDS = {
  CRITICAL: "Needs attention",
  HIGH: "Needs attention",
  MEDIUM: "Worth reviewing",
  LOW: "Worth reviewing",
  INFO: "Informational",
} as const;

/**
 * The central legal boundary statement. Embedded in every PDF report, shown at
 * onboarding, and published at /legal/disclaimer. Do not paraphrase it per
 * surface — import it.
 */
export const DISCLAIMER_SHORT =
  "Privacy Drift Monitor is a technical monitoring service. It records observable " +
  "browser behavior and flags potential issues for review. It does not provide legal " +
  "advice and does not determine legal compliance.";

/**
 * Returns every forbidden term found in `text`, or an empty array.
 * Used by the CI check and by the AI output validator (§8.7).
 */
export function findForbiddenTerms(text: string): string[] {
  const haystack = text.toLowerCase();
  return FORBIDDEN_TERMS.filter((term) => {
    // Whole-word / whole-phrase match so "compliant" does not fire inside
    // "non-compliant" twice, and "breach" inside "breached" is not a hit.
    const pattern = new RegExp(
      `(^|[^a-z0-9-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`,
      "i",
    );
    return pattern.test(haystack);
  });
}

export function assertApprovedTerminology(text: string, context: string): void {
  const found = findForbiddenTerms(text);
  if (found.length > 0) {
    throw new Error(
      `Forbidden terminology in ${context}: ${found.join(", ")}. ` +
        `See PLAN.md Part I §1.12 for the approved alternatives.`,
    );
  }
}
