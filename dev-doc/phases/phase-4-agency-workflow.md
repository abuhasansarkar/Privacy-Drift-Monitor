# Phase 4 — Agency Workflow

> **Goal:** findings become alerts, reports, and client-facing value.
> **Dependencies:** Phase 3 · **Status:** ⬜ Not started
> **Plan ref:** Part XII §12.3 (Phase 4), Part VI §6.9–§6.10, Part III §3.11, §3.13

This is the phase that makes the product **sellable**. Detection without alerting is a
dashboard nobody opens; alerting without reports is a tool the agency can't bill for.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 4.1 | Notification system: types, preferences, in-app center | M | [13-notifications-alerts](../features/13-notifications-alerts.md) | ⬜ |
| 4.2 | Alert rules, dispatcher, digests, quiet hours, flood control | L | [13-notifications-alerts](../features/13-notifications-alerts.md) | ⬜ |
| 4.3 | Email: Resend integration, all 19 templates, delivery webhooks | L | [13-notifications-alerts](../features/13-notifications-alerts.md) | ⬜ |
| 4.4 | Report system: 5 types, React templates, Playwright PDF renderer, S3 storage, async job | XL | [14-reports-white-label](../features/14-reports-white-label.md) | ⬜ |
| 4.5 | White-label: branding settings, contrast validation, snapshotting, leakage tests | M | [14-reports-white-label](../features/14-reports-white-label.md) | ⬜ |
| 4.6 | Client portal: magic-link auth, sessions, 5 pages, client-safe serializers | L | [15-client-portal](../features/15-client-portal.md) | ⬜ |
| 4.7 | Verification re-scan workflow | M | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ⬜ |
| 4.8 | Reports UI: library, wizard, detail, share links | M | [14-reports-white-label](../features/14-reports-white-label.md) | ⬜ |
| 4.9 | Settings: branding, scanning, alerts pages | M | [21-design-system](../features/21-design-system.md) | ⬜ |

## Order of attack

```
4.1 notifications  →  4.2 alert rules  →  4.3 email
4.5 branding  →  4.4 reports  →  4.8 reports UI
4.6 portal (depends on 4.5 branding resolution)
4.7 verification re-scan (independent, can slot anywhere after Phase 3)
```

Build **4.5 branding before 4.4 reports** — the report renderer resolves branding, and
retrofitting the resolver into a finished renderer is where cross-tenant leakage bugs get
introduced.

## Critical implementation rules

**Branding is resolved by an explicit `agencyId`-scoped query, and any branding cache is
keyed *only* by `agencyId`.** A cache keyed by anything else (report id, client id, request)
is how Agency A's logo ends up on Agency B's report. Part VI §6.9. This must be asserted by a
concurrent-render test, not reasoned about.

**Alert fatigue kills the product.** Quiet hours, digests and duplicate suppression are not
polish — they are the difference between a product people keep and one they mute. Duplicate
alerts are suppressed within 4 hours.

**Digests are computed in the agency's timezone.** Implement by grouping agencies by zone and
running one repeatable job per distinct zone — not one job per agency.

**The portal is a separate auth surface with a separate session.** Client-safe serializers
must make internal notes, rule IDs and raw evidence **structurally absent** from the response,
not merely hidden in the UI. Revocation invalidates sessions immediately.

**A failed report does not consume the allowance.** And the failure copy says so explicitly:
*"We couldn't generate this report. Nothing was charged against your report allowance."*

**In-app notifications are unaffected by a Resend outage.** Alerts still reach logged-in users
when email is down — keep the two paths independent.

## Acceptance criteria

From §12.3 and M6–M8 (§12.4).

- [ ] A critical issue produces an email within 60 s and an in-app notification
- [ ] Quiet hours defer non-critical alerts
- [ ] A daily digest groups a day's issues into one email, correct for the agency timezone
- [ ] Duplicate alerts are suppressed within 4 hours
- [ ] Delivery status is recorded from Resend webhooks
- [ ] A monthly report renders with agency branding and downloads as a PDF
- [ ] **Two agencies' reports rendered concurrently do not cross-contaminate branding** (asserted)
- [ ] All five report types generate; generation is async with progress and a completion notification
- [ ] Reports are stored under the tenant prefix and served by signed URL
- [ ] A failed report does not consume the allowance
- [ ] A portal user logs in by magic link and sees only their client's data
- [ ] Magic links expire; revocation invalidates sessions immediately
- [ ] Internal notes, rule IDs and raw evidence are structurally absent from portal responses
- [ ] Portal activity is audit-logged
- [ ] A resolved issue re-scans and transitions to `VERIFIED`

## Retention note

Secondary activation — the retention predictor — is **first white-label report generated
within 14 days** (Part XI §11.10). Prompt it with an in-app card and a day-7 email once at
least one scan has completed. This is why the report system is XL effort and worth it.
