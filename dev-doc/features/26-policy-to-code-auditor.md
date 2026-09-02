# Feature 26 — AI Policy-to-Code LLM Reconciliation Engine

> **Phase:** 11 · **Priority:** P1 · **Effort:** M · **Value:** 5
> **Status:** 🟢 Complete — PolicyAudit model created, rules PDM-R034, PDM-R035, PDM-R049 implemented and tested.
> **Plan refs:** PLAN-V2 Part I, Part III, Part IV, Part VI

## What it is

The **Policy-to-Code Reconciliation Engine** automatically scrapes the target website's `/privacy-policy`, `/cookie-policy`, and `/terms`, uses structured LLM extraction (`POLICY_EXTRACT_V1`) to identify declared vendor lists and retention claims, and executes deterministic diffing against active browser `TrackerDetection` and `NetworkRequest` records.

## Why it exists

Under **FTC Act Section 5 ("Unfair or Deceptive Practices")** and US state privacy laws, websites face massive fines when their technical tracking behavior contradicts what their public privacy policy promises (e.g., *BetterHelp*, *GoodRx*, *Flo Health* FTC enforcement actions).

## Dependencies

- Feature 05 (Scan Engine)
- Feature 08 (Tracker Detection)
- Feature 16 (AI Layer)

## Public interface

```ts
PolicyAudit                                        // Prisma model
R034, R035, R049                                   // Deterministic rules
```

## Deterministic Rules

| Rule ID | Category | Name & Trigger | Severity | Regulatory Benchmark |
|---|---|---|---|---|
| `PDM-R034` | `FTC_COMPLIANCE` | **Policy-to-Code Vendor Mismatch (Ghost Tracker)**<br>Active tracker detected in browser that is missing from privacy policy disclosures. | **High** | FTC Act Section 5 |
| `PDM-R035` | `FTC_COMPLIANCE` | **Sensitive Field Data Transmitted to Third Party**<br>Form field inputs (email, password, health query) found in outgoing 3P payloads. | **Critical** | FTC BetterHelp / GoodRx Cases |
| `PDM-R049` | `POLICY` | **Stale Privacy Policy Date (> 12 Months)**<br>Privacy policy declares an effective date older than 365 days. | **Info** | CCPA Annual Refresh Mandate |

## Build steps

- [x] Create `PolicyAudit` table in Prisma schema with `agencyId`, `websiteId`, `scanId`, `policyUrl`, `declaredVendors`, `detectedVendors`, `undisclosedVendors`, and `complianceScore`.
- [x] Implement deterministic rules `PDM-R034`, `PDM-R035`, and `PDM-R049` in `packages/analysis/src/rules/policy-compliance.ts`.
- [x] Register rules in `SCAN_RULES`.
- [x] Surface policy vs code mismatch matrix in scan details.

## Acceptance criteria

- [x] Undisclosed active marketing tags generate `PDM-R034` at High severity with exact evidence links.
- [x] Outbound request URLs containing unredacted emails/passwords trigger `PDM-R035` at Critical severity.
- [x] Pure deterministic evaluation is preserved — AI is strictly quarantined to policy text extraction.
