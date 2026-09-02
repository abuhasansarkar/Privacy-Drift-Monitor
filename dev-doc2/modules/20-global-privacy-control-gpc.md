# Module 20 — Global Privacy Control (GPC) Verification

> **Tier:** V2 · **Package:** `@pdm/scanner`, `@pdm/analysis`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Under the California Consumer Privacy Act (CCPA / CPRA) and Colorado Privacy Act (CPA), businesses must honor browser-level opt-out signals. Regulators (e.g., California AG vs. Sephora, DoorDash) impose fines up to $7,500 per violation for ignoring GPC.

## 2. Architecture & Journey 5 Execution
```typescript
// packages/scanner/src/phase-runner.ts
const gpcContext = await browser.newContext({
  extraHTTPHeaders: {
    'Sec-GPC': '1',
    'DNT': '1',
  },
});
```
* **Verification Algorithm:**
  1. Load page with `Sec-GPC: 1` active.
  2. Inspect if the CMP banner automatically signals *"Opt-Out Honored"*.
  3. Assert whether third-party advertising tags (Meta, TikTok, Google Ads, Criteo) fire.
  4. If advertising pixels fire, trigger rule `PDM-R031: GPC_SIGNAL_IGNORED` (**Critical**).

## 3. Key Files
* `packages/scanner/src/phase-runner.ts`: GPC phase runner.
* `packages/analysis/src/rules/us-compliance.ts`: `PDM-R031` rule implementation.
* `src/app/(app)/app/websites/[websiteId]/consent/`: GPC compliance visual status widget.

## 4. Acceptance Criteria
* **Given** a website loaded with `Sec-GPC: 1` enabled,
* **When** a Meta Pixel or TikTok tag fires,
* **Then** finding `PDM-R031` is generated with Critical severity,
* **And** the report cites Cal. Civ. Code § 1798.135.
