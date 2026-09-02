# Feature 24 — CIPA Wiretap & Session Replay Risk Analyzer

> **Phase:** 9 · **Priority:** P0 · **Effort:** M · **Value:** 5
> **Status:** 🟢 Complete — Rules PDM-R036 and PDM-R037 implemented, SessionReplayAudit model added, and rule validation suites passing.
> **Plan refs:** PLAN-V2 Part I, Part III, Part V, Part VI

## What it is

The **Session Replay & CIPA Wiretap Risk Analyzer** detects session recording scripts (*Hotjar, FullStory, Microsoft Clarity, LogRocket, Smartlook, Lucky Orange*) and inspects whether sensitive form elements (`password`, `email`, `tel`, `credit card`) contain mandatory DOM masking attributes.

## Why it exists

Over 1,000 class-action lawsuits have been filed under the **California Invasion of Privacy Act (CIPA § 631)** and Pennsylvania Wiretap Act asserting that unmasked session replay scripts and pre-consent live chat widgets constitute illegal wiretapping and unauthorized keystroke interception.

## Dependencies

- Feature 05 (Scan Engine)
- Feature 08 (Tracker Detection)
- Feature 09 (Rule Engine)

## Public interface

```ts
SessionReplayAudit                                 // Prisma model
R036, R037                                         // Deterministic rules
```

## Deterministic Rules

| Rule ID | Category | Name & Trigger | Severity | Regulatory Benchmark |
|---|---|---|---|---|
| `PDM-R036` | `CIPA_WIRETAP` | **Session Replay Unmasked Input Recording**<br>Session recorder active on form pages without verified DOM masking attributes. | **Critical** | California CIPA / Wiretap Class Actions |
| `PDM-R037` | `CIPA_WIRETAP` | **Chat Widget Pre-Consent Interception**<br>Live chat widget recording user IP/fingerprint before affirmative user action. | **Medium** | CIPA Wiretapping Precedents |

## Build steps

- [x] Create `SessionReplayAudit` table in Prisma schema with `agencyId`, `scanId`, `vendorId`, `unmaskedFields`, `isMaskingActive`, and `riskSeverity`.
- [x] Define session recording vendor signatures in `packages/analysis/src/rules/cipa-wiretap.ts`.
- [x] Implement deterministic rules `PDM-R036` and `PDM-R037`.
- [x] Register rules in `SCAN_RULES` with high precedence (precedence 92).
- [x] Surface session replay audit results in website diagnostics view.

## Acceptance criteria

- [x] Identifying an active session replay tool on a form page generates `PDM-R036` at Critical severity.
- [x] Chat widgets initializing in `NO_CONSENT` phase trigger `PDM-R037` at Medium severity.
- [x] All findings carry exact evidence references pointing to observed network/cookie payloads.
