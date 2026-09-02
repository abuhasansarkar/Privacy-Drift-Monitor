# Module 09 — Dual Scoring System (Score vs. Confidence)

> **Tier:** MVP · **Package:** `@pdm/analysis`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
If a crawler is blocked by a WAF (403 Forbidden) or a banner fails to load, legacy scanners report "0 violations" and award a 100/100 score. This provides dangerous false reassurance.

## 2. Architecture & The Two Metrics
* **1. Technical Privacy Monitoring Score (0–100):**
  A deterministic penalty deduction model:
  $$\text{Score} = \max\left(0, 100 - \sum \text{Penalty}(\text{Finding})\right)$$
  Penalties: Critical (-25), High (-15), Medium (-5), Low (-2).
* **2. Scan Confidence Index (0–100%):**
  Measures crawl completeness and execution integrity:
  * 100%: All phases reached network-idle; CMP controls clicked and verified.
  * 60%: CMP present, but reject button was missing or unclickable (`PARTIAL`).
  * 20%: WAF challenge or navigation timeout (`INCONCLUSIVE`). Score is displayed as `—`.

## 3. Implementation Code
```typescript
// packages/analysis/src/score.ts
export function calculateMonitoringScore(findings: Finding[]): number;
export function calculateScanConfidence(phases: ScanPhaseResult[]): {
  confidence: number;
  status: "COMPLETED" | "PARTIAL" | "INCONCLUSIVE";
};
```

## 4. Key Files
* `packages/analysis/src/score.ts`: Mathematical score and confidence algorithms.
* `src/components/scans/health-score.tsx`: UI component rendering score with confidence badges.

## 5. Acceptance Criteria
* **Given** a scan where Cloudflare blocks navigation with 403 Forbidden,
* **When** scoring executes,
* **Then** the status is marked `INCONCLUSIVE`, confidence is 20%,
* **And** no 100/100 score is awarded.
