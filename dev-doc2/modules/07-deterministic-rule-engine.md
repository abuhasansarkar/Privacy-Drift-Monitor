# Module 07 — Deterministic Rule Engine (PDM-R001 to PDM-R050)

> **Tier:** MVP / V2 · **Package:** `@pdm/analysis`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Automated privacy audits that rely on non-deterministic LLMs produce fluctuating, unverifiable claims. Findings must be 100% reproducible and grounded in technical rules.

## 2. Architecture & The 50 Master Rules
Rules evaluate raw HTTP requests, cookies, storage, and DOM state against jurisdiction profiles:
* **Pre-Consent Violations (`PDM-R001`–`PDM-R005`):** Marketing trackers firing in `NO_CONSENT`.
* **Reject All Regressions (`PDM-R011`–`PDM-R015`):** Trackers or cookies persisting post-rejection.
* **Cookie Hygiene (`PDM-R021`–`PDM-R025`):** Expiry > 13 months, missing `Secure` or `SameSite`.
* **US CCPA / GPC (`PDM-R031`–`PDM-R035`):** Ignoring `Sec-GPC: 1` headers or missing opt-out links.
* **CIPA Wiretap (`PDM-R036`–`PDM-R037`):** Unmasked keystroke recording on form inputs.
* **FTC Act §5 (`PDM-R041`–`PDM-R042`):** Privacy policy text contradicting observed network traffic.
* **Drift & CNAME (`PDM-R046`–`PDM-R050`):** New tracking vendors or CNAME cloaking discovered.

## 3. Implementation Code
```typescript
// packages/analysis/src/rules/types.ts
export interface AnalysisRule {
  readonly id: string; // PDM-R001 to PDM-R050
  readonly severity: Severity;
  readonly category: RuleCategory;
  evaluate(evidence: NormalizedEvidence): RuleEvaluationResult[];
}
```

## 4. Key Files
* `packages/analysis/src/rules/consent.ts`: Pre-consent and Reject All rules.
* `packages/analysis/src/rules/hygiene.ts`: Cookie security flags and lifespans.
* `packages/analysis/src/rules/us-compliance.ts`: CCPA and GPC evaluation.
* `packages/analysis/src/rules/cipa-wiretap.ts`: Session replay keystroke rules.

## 5. Acceptance Criteria
* **Given** an analytics tag firing in the `NO_CONSENT` phase,
* **When** the rule engine runs,
* **Then** it generates finding `PDM-R001` with Critical severity, linking the exact request ID.
