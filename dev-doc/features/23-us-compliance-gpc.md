# Feature 23 — US Compliance & Global Privacy Control (GPC) Engine

> **Phase:** 8 · **Priority:** P0 · **Effort:** M · **Value:** 5
> **Status:** 🟢 Complete — Rules PDM-R031, PDM-R032, PDM-R033 implemented, GPC header injection in scanner context, schema models and unit test suite verified.
> **Plan refs:** PLAN-V2 Part I, Part II §2.2, Part III (Rules PDM-R031–PDM-R033), Part VI

## What it is

The **Global Privacy Control (GPC) and US State Law Compliance Engine** enables continuous testing of browser-level opt-out signals (`Sec-GPC: 1`, `DNT: 1`) under California Consumer Privacy Act (CCPA), California Privacy Rights Act (CPRA), and Colorado Privacy Act (CPA). It audits whether websites honor universal opt-out signals and suppress third-party marketing tags (Meta, TikTok, Google Ads, Criteo) or display mandatory "Do Not Sell/Share" mechanisms.

## Why it exists

Regulatory enforcement by the California Privacy Protection Agency (CPPA) and California AG (e.g., *Sephora*, *DoorDash*, *Tractor Supply* settlements) has made automated GPC compliance a major liability for web agencies and brand portfolios. Agencies need automated proof that client sites do not ignore GPC signals and that CCPA preference centers actually stop outgoing ad telemetry.

## Dependencies

- Feature 05 (Scan Engine)
- Feature 06 (Consent Engine)
- Feature 09 (Rule Engine)

## Public interface

```ts
ConsentPhase = "GLOBAL_PRIVACY_CONTROL"
GpcAuditRecord                                     // Prisma model
R031, R032, R033                                   // Deterministic rules
```

## Deterministic Rules

| Rule ID | Category | Name & Trigger | Severity | Regulatory Benchmark |
|---|---|---|---|---|
| `PDM-R031` | `US_CCPA` | **Global Privacy Control (GPC) Signal Ignored**<br>Ad/marketing trackers continue firing when `Sec-GPC: 1` header is present. | **Critical** | CCPA / CPRA Sephora Enforcement |
| `PDM-R032` | `US_CCPA` | **Missing "Do Not Sell/Share My Personal Information" Link**<br>Page targeting US/California lacks a compliant DNS/GPC opt-out footer control. | **High** | Cal. Civ. Code § 1798.135 |
| `PDM-R033` | `US_CCPA` | **Broken CCPA Opt-Out Preference Center**<br>Selecting opt-out fails to suppress downstream advertising network tags. | **Critical** | CCPA Tractor Supply Case |

## Build steps

- [x] Extend `ConsentPhase` enum with `GLOBAL_PRIVACY_CONTROL` across Prisma schema, Zod schemas, and scanner domain types.
- [x] Create `GpcAuditRecord` table with `agencyId`, `scanId`, `gpcHeaderSent`, `signalAcknowledged`, `trackersSuppressed`, and `offendingVendors`.
- [x] Update Playwright context runner in `runPhase()` to inject `Sec-GPC: 1` and `DNT: 1` extra HTTP headers.
- [x] Implement deterministic rules `PDM-R031`, `PDM-R032`, and `PDM-R033` in `packages/analysis/src/rules/us-compliance.ts`.
- [x] Add rule unit tests in `packages/analysis/src/__tests__/us-compliance.test.ts`.
- [x] Integrate GPC results into website scan diagnostics and reporting views.

## Acceptance criteria

- [x] Loading a page with `GLOBAL_PRIVACY_CONTROL` phase transmits `Sec-GPC: 1` header to origin and all third-party requests.
- [x] If an advertising or marketing tracker fires during the GPC journey, `PDM-R031` triggers at Critical severity (if corroborated) or High severity.
- [x] Undetermined GPC runs never produce false passes or suppress issues (P5/P6 guarantee maintained).
- [x] All copy conforms strictly to approved terminology (*"Observed marketing tracker firing when browser transmitted opt-out header"*).

## Tests required

| Level | What |
|---|---|
| Unit | `packages/analysis/src/__tests__/us-compliance.test.ts` (4 tests verifying R031, R032, R033) |
| Parity | `packages/database/src/__tests__/enum-parity.test.ts` & `tenancy.test.ts` |
| Scanner | `packages/scanner/src/__tests__/types.test.ts` |
