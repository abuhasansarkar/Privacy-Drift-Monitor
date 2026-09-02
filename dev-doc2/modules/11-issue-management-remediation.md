# Module 11 — Issue Management & Automated Remediation

> **Tier:** MVP / V1 · **Package:** `@pdm/analysis`, `src/server/actions`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Showing a list of tracking issues without actionable fix guidance or resolution verification leads to stale, unresolved findings. Developers need exact fix snippets and automated re-scans.

## 2. Architecture & Lifecycle
* **Issue State Machine:**
  ```
  NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → VERIFIED
                        ↓                  ↑
                   IGNORED / ACCEPTED_RISK ┘
  ```
* **Automated Re-Scan Verification:** Marking an issue `RESOLVED` enqueues a targeted scan. If the offending tag is absent, status advances to `VERIFIED`. If still present, it reopens with `VERIFICATION_FAILED`.
* **Automated Remediation Generator:** Generates GTM Consent Mode v2 triggers and CMP blocking code snippets.

## 3. Key Files
* `packages/analysis/src/remediation/`: CMP and GTM snippet generators.
* `src/app/(app)/app/issues/[issueId]/page.tsx`: Issue detail view with evidence chain.
* `src/components/issues/remediation-dialog.tsx`: Code copy-paste modal.

## 4. Acceptance Criteria
* **Given** an open finding for pre-consent Meta pixel,
* **When** clicking "View Remediation",
* **Then** the UI renders copy-paste GTM trigger instructions linked to `ad_storage`,
* **And** marking resolved triggers an immediate verification re-scan.
