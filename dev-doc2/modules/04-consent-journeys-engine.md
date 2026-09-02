# Module 04 — Consent Journeys Engine

> **Tier:** MVP / V2 · **Package:** `@pdm/scanner`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Static scanners merely check if a banner HTML element exists. Real privacy regressions happen when trackers fire before consent, after Reject All, or continue running after consent is revoked.

## 2. Architecture & The 6 Journeys
1. **`NO_CONSENT`:** Initial load with 5-second dwell; captures pre-consent tracking leaks.
2. **`REJECT_ALL`:** Identifies CMP and clicks Reject/Deny; asserts marketing scripts do not fire.
3. **`ACCEPT_ALL`:** Clicks Accept All to capture the approved tracking baseline.
4. **`WITHDRAW`:** Re-opens banner and revokes consent; verifies tag teardown.
5. **`GPC SIGNAL` (V2):** Injects `Sec-GPC: 1` header to verify California/Colorado opt-out compliance.
6. **`INTERACTION` (V2):** Simulates 100% scroll depth and form submissions to trigger lazy-loaded trackers.

## 3. Key Files
* `packages/scanner/src/phase-runner.ts`: Execution logic for each consent journey.
* `packages/scanner/src/scan.ts`: Orchestration of all phases for a given target page.
* `packages/scanner/src/types.ts`: `ConsentPhase` enum and phase outcome contracts.

## 4. Acceptance Criteria
* **Given** a site with Google Analytics and Meta Pixel,
* **When** running the `REJECT_ALL` journey,
* **Then** the Meta pixel request is absent from the recorded network stream,
* **And** the scan phase logs `CMP_REJECT_SUCCESS`.
