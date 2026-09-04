# Phase 15 — Reserved Rules Activation & Deep Browser Instrumentation

> **Goal:** Eliminate the five `RESERVED_RULE_IDS` (`PDM-R029`, `PDM-R040`, `PDM-R041`, `PDM-R043`, `PDM-R045`) by implementing the precise browser fact recordings each requires, bringing the actively evaluating rule inventory to 52.  
> **Status:** 🟢 Complete  
> **Target Packages:** `packages/scanner`, `packages/analysis`

---

## 1. Scope & Technical Requirements

Five rules were reserved in V1 because writing predicates without recorded facts produced fake findings. Phase 15 provides the exact instrumentation for each fact source:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       RESERVED RULES INSTRUMENTATION                                    │
├──────────┬─────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ Rule ID  │ Description                 │ Fact Recording Mechanism Added in Phase 15                     │
├──────────┼─────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ PDM-R029 │ Cookie Wall / Forcible Gate │ DOM scroll-lock check, backdrop overlay surface > 90% viewport │
│ PDM-R040 │ Cross-Border PII Transfer   │ Geo-IP lookup on remote IP of every intercepted HTTP request   │
│ PDM-R041 │ Asymmetric Button Pattern   │ getBoundingClientRect() & computed color contrast ratio diff   │
│ PDM-R043 │ Form Submit Tracker Spike   │ Synthetic form filling & submit in INTERACTIVE_ACTION phase    │
│ PDM-R045 │ Browser Fingerprinting API  │ Early JS traps on HTMLCanvasElement & AudioContext methods     │
└──────────┴─────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Tasks

| # | Task | File / Path | Description |
|---|---|---|---|
| **15.1** | Fingerprint Trap Script | `packages/scanner/src/instrumentation/fingerprint-trap.ts` | Injects early proxy on `HTMLCanvasElement.prototype.toDataURL`, `AudioContext.prototype.createOscillator`, and `WebGLRenderingContext.prototype.readPixels`. |
| **15.2** | DOM Gating & Bounding Boxes | `packages/scanner/src/instrumentation/dom-gating.ts` | Evaluates viewport overlay percentage, scroll locks, and computed CSS dimensions/colors of Accept vs. Reject buttons. |
| **15.3** | Synthetic Form Submitter | `packages/scanner/src/consent/interactive-runner.ts` | Discovers contact/newsletter forms during `INTERACTIVE_ACTION`, injects dummy values, submits, and flags tracker bursts. |
| **15.4** | GeoIP Remote Resolution | `packages/scanner/src/net/geoip.ts` | Resolves destination country code for each remote server IP address via local GeoLite2/MaxMind DB. |
| **15.5** | Implement R029, R040, R041, R043, R045 | `packages/analysis/src/rules/advanced.ts` | Write pure deterministic predicates for each of the 5 rules against the newly recorded facts. |
| **15.6** | Clear `RESERVED_RULE_IDS` | `packages/analysis/src/rules.ts` | Move all 5 IDs from `RESERVED_RULE_IDS` into `RULES`. Update `rules.test.ts`. |

---

## 3. Key Instrumentation Implementations

### 3.1 Fingerprint API Trap (`PDM-R045`)
```ts
// packages/scanner/src/instrumentation/fingerprint-trap.ts
export const FINGERPRINT_TRAP_SCRIPT = `
(() => {
  window.__pdm_fingerprint_calls = [];
  const trap = (api) => {
    try {
      window.__pdm_fingerprint_calls.push({ api, timestamp: Date.now() });
    } catch (_) {}
  };

  if (typeof HTMLCanvasElement !== 'undefined') {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      trap('canvas.toDataURL');
      return origToDataURL.apply(this, args);
    };
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      trap('canvas.getImageData');
      return origGetImageData.apply(this, args);
    };
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    const origOsc = AudioCtx.prototype.createOscillator;
    AudioCtx.prototype.createOscillator = function(...args) {
      trap('audio.createOscillator');
      return origOsc.apply(this, args);
    };
  }
})();
`;
```

### 3.2 Asymmetric Button Ratio (`PDM-R041`)
```ts
// packages/scanner/src/instrumentation/dom-gating.ts
export async function measureConsentButtonAsymmetry(page: Page) {
  return page.evaluate(() => {
    const acceptBtn = document.querySelector('[data-cmp-accept], #accept, .accept-all, button:has-text("Accept")');
    const rejectBtn = document.querySelector('[data-cmp-reject], #reject, .reject-all, button:has-text("Reject")');
    if (!acceptBtn || !rejectBtn) return null;

    const rectAccept = acceptBtn.getBoundingClientRect();
    const rectReject = rejectBtn.getBoundingClientRect();
    const areaAccept = rectAccept.width * rectAccept.height;
    const areaReject = rectReject.width * rectReject.height;

    return {
      areaRatio: areaReject > 0 ? areaAccept / areaReject : 1,
      acceptArea: areaAccept,
      rejectArea: areaReject
    };
  });
}
```

---

## 4. Acceptance Criteria & Test Specifications

- [x] **Cookie Wall (R029):** A page where `body` has `overflow: hidden` and a modal overlays >90% of screen with no close/dismiss option triggers `PDM-R029` (**Severity: High**).
- [x] **Cross-Border Transfer (R040):** An EU-egress scan observing unconsented tracking requests resolving to a US IP triggers `PDM-R040` (**Severity: Medium**).
- [x] **Asymmetric Buttons (R041):** When the "Accept All" button is more than $2\times$ the area of the "Reject All" button, triggers `PDM-R041` (**Severity: Medium**).
- [x] **Form Submission Trigger (R043):** When submitting a contact form triggers an unconsented Meta or Google Ads conversion pixel, triggers `PDM-R043` (**Severity: High**).
- [x] **Fingerprinting (R045):** A script calling `toDataURL` and `createOscillator` on page load triggers `PDM-R045` (**Severity: Critical**).
- [x] **Zero Reserved Rules:** `rules.test.ts` asserts that `RESERVED_RULE_IDS` is completely empty.

---

## 5. Verification Commands

```powershell
# 1. Test DOM gating and fingerprint traps in scanner
npx.cmd vitest run packages/scanner/src/__tests__/fingerprint-trap.test.ts packages/scanner/src/__tests__/dom-gating.test.ts

# 2. Test newly activated rules in analysis package
npx.cmd vitest run packages/analysis/src/__tests__/rules-advanced.test.ts packages/analysis/src/__tests__/rules.test.ts

# 3. Master gate
npm run verify
```
