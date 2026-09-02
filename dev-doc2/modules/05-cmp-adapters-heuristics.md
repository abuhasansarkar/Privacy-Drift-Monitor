# Module 05 — CMP Adapters & Heuristic Detection

> **Tier:** MVP · **Package:** `@pdm/scanner`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Websites employ diverse CMP platforms (Usercentrics, Cookiebot, OneTrust, Complianz, Didomi). Each renders different DOM hierarchies, iframe wrappers, or Shadow DOM roots.

## 2. Architecture & Adapter Interface
```typescript
export interface ConsentAdapter {
  readonly id: string;
  readonly name: string;
  detect(page: Page): Promise<CmpDetectionResult>;
  executeRejectAll(page: Page): Promise<CmpActionResult>;
  executeAcceptAll(page: Page): Promise<CmpActionResult>;
  executeWithdraw(page: Page): Promise<CmpActionResult>;
}
```

## 3. Supported CMP Coverage
* **Usercentrics:** Handles both primary modal and "Deny" button variants.
* **Cookiebot:** Handles `#CybotCookiebotDialog` and standard rejection controls.
* **OneTrust:** Resolves `#onetrust-banner-sdk` and granular preference center buttons.
* **Complianz & CookieYes:** Targets native WordPress consent containers.
* **Generic Heuristic Adapter:** Scans Shadow DOM boundaries and evaluates accessibility attributes (`aria-label="Reject all"`, `aria-label="Deny"`).

## 4. Key Files
* `packages/scanner/src/consent/usercentrics.ts`: Usercentrics adapter.
* `packages/scanner/src/consent/cookiebot.ts`: Cookiebot adapter.
* `packages/scanner/src/consent/onetrust.ts`: OneTrust adapter.
* `packages/scanner/src/consent/generic-adapter.ts`: Heuristic fallback.

## 5. Acceptance Criteria
* **Given** a site running Usercentrics with a "Deny" button,
* **When** the adapter executes `executeRejectAll()`,
* **Then** the dialog closes cleanly with the rejection state persisted.
