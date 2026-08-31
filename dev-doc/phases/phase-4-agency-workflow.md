# Phase 4 — Agency Workflow

> **Goal:** findings become alerts, reports, and client-facing value.
> **Dependencies:** Phase 3 · **Status:** 🟡 Built; partially verified
> **Plan ref:** Part XII §12.3 (Phase 4), Part VI §6.9–§6.10, Part III §3.11, §3.13

This is the phase that makes the product **sellable**. Detection without alerting is a
dashboard nobody opens; alerting without reports is a tool the agency can't bill for.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 4.1 | Notification system: types, preferences, in-app center | M | [13-notifications-alerts](../features/13-notifications-alerts.md) | ✅ |
| 4.2 | Alert rules, dispatcher, digests, quiet hours, flood control | L | [13-notifications-alerts](../features/13-notifications-alerts.md) | ✅ |
| 4.3 | Email: Resend integration, all 19 templates, delivery webhooks | L | [13-notifications-alerts](../features/13-notifications-alerts.md) | 🟡 |
| 4.4 | Report system: 5 types, React templates, Playwright PDF renderer, S3 storage, async job | XL | [14-reports-white-label](../features/14-reports-white-label.md) | ✅ |
| 4.5 | White-label: branding settings, contrast validation, snapshotting, leakage tests | M | [14-reports-white-label](../features/14-reports-white-label.md) | ✅ |
| 4.6 | Client portal: magic-link auth, sessions, 5 pages, client-safe serializers | L | [15-client-portal](../features/15-client-portal.md) | 🟡 |
| 4.7 | Verification re-scan workflow | M | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ✅ |
| 4.8 | Reports UI: library, wizard, detail, share links | M | [14-reports-white-label](../features/14-reports-white-label.md) | ✅ |
| 4.9 | Settings: branding, scanning, alerts pages | M | [21-design-system](../features/21-design-system.md) | 🟡 |

### What each 🟡 is missing

- **4.3** — the transport is a fetch client against the Resend HTTP API and has
  **never run against Resend**: with no `RESEND_API_KEY` every send is recorded
  as `simulated`, which is deliberate and visible in Alerts → History. The
  webhook handler verifies Svix signatures but has not seen a real event.
  Manual render checks in Gmail / Outlook / Apple Mail are still outstanding.
- **4.6** — routing, sessions, revocation and the client-safe serializers are
  covered by 14 integration tests, and the pages render. What is untested is the
  MAILBOX HOP: the invitation email has never actually arrived anywhere, because
  Resend is unconfigured. Everything either side of that hop is asserted.
- **4.9** — Branding and Notifications settings pages are built. **Scan Settings
  is not** (§3.11 specifies default frequency, page limit, priority, screenshot
  policy, retention, user-agent suffix, respect-robots and global ignore
  patterns); `AgencyScanSettings` exists in the schema with no editor.

### Deviations from the plan, all deliberate

| Where | Plan says | Built | Why |
|---|---|---|---|
| `packages/notifications` | not in the §12.1 package list | new package | The dispatch decision is needed in BOTH processes and is pure; putting it in `worker/` would make the app import across a deployable boundary |
| Email templates | React Email | escaped HTML tagged templates | Email markup is table-based with inline styles; React buys nothing and costs the worker a `react-dom/server` dependency and a JSX step. Escaping is enforced by the `html` tag |
| Resend | `resend` SDK | direct `fetch` | One POST; we already own the retry, breaker and idempotency key. Swapping providers is one file |
| Branding cache | Redis, 5 min | per-process map, 5 min | Strictly safer for the leakage property — nothing crosses a process boundary — and invalidation is already explicit. Swap the object, not the accessor |
| Portal cookie | `__Host-` prefix **and** `Path=/portal` | `Path=/portal`, no prefix | The two are mutually exclusive: a `__Host-` cookie with a narrower path is rejected by the browser. The path restriction is the stronger control here |
| Alert rule editor | modal dialog (§5.21) | inline panel | Eleven fields including a quiet-hours fieldset; a dialog at 390px is a scroll trap with Save below the fold (§11.5 outranks matching the mock) |

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

From §12.3 and M6–M8 (§12.4). ✅ = verified by a passing test or an observed
run; 🟡 = implemented and reasoned about, not yet demonstrated.

- 🟡 A critical issue produces an email within 60 s and an in-app notification —
      the path is built and the queue options are tuned for it, but the 60 s
      figure has not been measured
- ✅ Quiet hours defer non-critical alerts — `policy.test.ts`, including the
      per-rule critical override and its opt-out
- ✅ A daily digest groups a day's issues into one email, correct for the agency
      timezone — `digest.test.ts`, including a DST-transition morning
- ✅ Duplicate alerts are suppressed within 4 hours — `policy.test.ts`
- 🟡 Delivery status is recorded from Resend webhooks — handler written and
      signature-verified; never exercised against a real event
- ✅ A monthly report renders with agency branding and downloads as a PDF —
      observed: `%PDF-`, 3 pages, ~230 KB, under `agencies/<id>/reports/`
- ✅ **Two agencies' reports rendered concurrently do not cross-contaminate
      branding** — `packages/reports/src/__tests__/branding.test.ts`, 12
      interleaved renders asserted on the brand-bearing declarations
- ✅ All five report types generate — observed, each producing a real PDF:
      SCAN 3pp/244KB · ISSUE 2pp/149KB · MONTHLY_MONITORING 3pp/226KB ·
      WEBSITE_HEALTH 2pp/176KB · PRIVACY_DRIFT 2pp/179KB
- ✅ Reports are stored under the tenant prefix and served by signed URL
- ✅ A failed report does not consume the allowance — nothing decrements on the
      failure path, and the notification says so in §12.3's words
- ✅ A portal user logs in by magic link and sees only their client's data —
      `src/server/portal/__tests__/serializers.test.ts` runs a real magic-link
      round trip and asserts that a session for client A cannot read client B's
      findings, reports or checks, **including by report id inside the same
      agency**
- ✅ Magic links expire; revocation invalidates sessions immediately — single-use
      token burnt in the same transaction as the session insert; revoke deletes
      sessions in one transaction and `getPortalSession` re-checks `revokedAt`
- ✅ Internal notes, rule IDs and raw evidence are structurally absent from
      portal responses — asserted on the serialised JSON, walking the payload
      recursively against the §3.13 forbidden list, exactly as feature doc 15
      requires ("assert on the JSON, not the render")
- ✅ Portal activity is audit-logged with `actorType: 'portal_user'`
- ✅ A resolved issue re-scans and transitions to `VERIFIED` — resolving queues a
      `VERIFICATION` scan; analysis promotes RESOLVED → VERIFIED only on a
      COMPLETE scan, and never on the scan that did the resolving

### Verified by running it, not by reading it

Three defects only showed up when the processes actually started, and all three
are now fixed with the reason recorded at the fix site:

1. **BullMQ rejects a job id containing `:`** — every natural key here
   (`agency:type:entity`) hit it. `toJobId()` rewrites at the enqueue boundary;
   the database keys keep their colons.
2. **`export *` in a `.ts` barrel is invisible to Node's ESM loader under tsx** —
   the worker died at boot on a symbol that demonstrably existed.
   `@pdm/notifications` and `@pdm/reports` now re-export explicitly, as
   `@pdm/database` already did.
3. **The report templates were transformed with the classic JSX runtime** by
   esbuild and threw `React is not defined` at render time, on files `tsc` was
   happy with. Explicit `import * as React` in the three `.tsx` files.

Plus one visual defect caught by screenshotting the output: "Could not be
determined" at 18pt burst its stat tile. Long values now step down a size
rather than being truncated — the approved outcome wording has to stay whole.

## Retention note

Secondary activation — the retention predictor — is **first white-label report generated
within 14 days** (Part XI §11.10). Prompt it with an in-app card and a day-7 email once at
least one scan has completed. This is why the report system is XL effort and worth it.
