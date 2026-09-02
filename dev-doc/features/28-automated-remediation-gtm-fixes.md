# Feature 28 — Automated Remediation, GTM Auto-Fix & Executive V2 Reports

> **Phase:** 13 · **Priority:** P1 · **Effort:** M · **Value:** 5
> **Status:** 🟢 Complete — GTM recipe generator, CMP script blocking library, Remediation dialog UI and Deploy & Verify actions fully implemented and tested.
> **Plan refs:** PLAN-V2 Part VII, Part VIII

## What it is

The **Automated Remediation Engine & GTM Auto-Fix Generator** converts detected privacy drift and non-compliant tracker findings into downloadable, executable fix recipes:
1. **Google Tag Manager Container JSON**: Pre-configured triggers and tags listening to `consent_update` / `cookie_consent_marketing` events ready for 1-click import into GTM.
2. **CMP Script Blocking Snippets**: Copy-paste script wrappers for Cookiebot, OneTrust, Usercentrics, Klaro, Termly, Axeptio, and WordPress.
3. **1-Click "Deploy & Verify" Re-Scan**: High-priority re-scan button to confirm remediation instantly.
4. **Executive Multi-Jurisdiction PDF Report V2**: White-label reports with regional breakdowns (EU, UK, US CCPA, FTC risk, CIPA wiretap audit).

## Why it exists

Agency developers and account managers need actionable fix code, not just alerts. Providing copy-paste GTM recipes and CMP snippets cuts remediation time from days to minutes, turning Privacy Drift Monitor into an indispensable agency operating system.

## Dependencies

- Feature 09 (Rule Engine)
- Feature 14 (Reports & White-Label)

## Build steps

- [x] Establish rule recommendations and action text across all 50 deterministic rules.
- [x] Configure multi-jurisdiction data models in Prisma schema.
- [x] Implement GTM JSON container generator utility in `packages/analysis/src/remediation/gtm.ts`.
- [x] Add CMP code wrapper templates in `packages/analysis/src/remediation/cmp.ts`.
- [x] Integrate `RemediationDialog` into issue details with GTM download and CMP code copy.
- [x] Add 1-click "Deploy & Verify (Re-Scan)" trigger button connecting to scanner orchestration.

## Acceptance criteria

- [x] Generated GTM JSON containers validate against official Google Tag Manager container schema.
- [x] CMP script wrappers accurately match the site's detected CMP vendor.
- [x] Issue details page provides instant fix recipes and 1-click re-scan verification.
