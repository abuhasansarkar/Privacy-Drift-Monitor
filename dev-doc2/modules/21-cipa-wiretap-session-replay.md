# Module 21 — CIPA Wiretap & Session Replay Risk Analyzer

> **Tier:** V2 · **Package:** `@pdm/analysis`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Hundreds of class-action lawsuits under the California Invasion of Privacy Act (CIPA § 631) target companies using session replay tools (Hotjar, FullStory, Microsoft Clarity) that record user keystrokes and form inputs without prior wiretap consent.

## 2. Architecture & Inspection Algorithm
* **Vendor Detection:** Identifies active session replay scripts by script signature.
* **Form Masking Audit:** Evaluates the DOM to determine whether sensitive input fields (`type="password"`, `name="card"`, `name="ssn"`, `type="email"`) carry appropriate masking attributes (e.g., `data-recording-ignore` or `fs-exclude`).
* **Rule Trigger:** If an active recorder runs without field-level masking or prior consent, generates `PDM-R036: SESSION_REPLAY_UNMASKED_INPUTS`.

## 3. Key Files
* `packages/analysis/src/rules/cipa-wiretap.ts`: CIPA wiretap analysis rule.
* `packages/analysis/src/__tests__/remediation.test.ts`: Test coverage verifying form mask inspection.

## 4. Acceptance Criteria
* **Given** a site embedding Microsoft Clarity where a credit card or password input is not masked,
* **When** the analysis engine executes,
* **Then** finding `PDM-R036` is flagged with High severity,
* **And** remediation guidance provides exact DOM masking attributes.
