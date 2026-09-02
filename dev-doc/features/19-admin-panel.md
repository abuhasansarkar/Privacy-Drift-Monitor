# Feature 19 — Admin Panel

> **Phase:** 6 · **Priority:** P0 · **Effort:** XL · **Value:** 4
> **Status:** ✅ Complete
> **Plan refs:** Part III §3.12 (all 15 pages)

## What it is

The platform operations surface at `/admin`, gated by `SUPER_ADMIN` — which is **not an agency
role**. It is a platform-level flag on `User`, checked in `(admin)/layout.tsx` **and re-checked
in every admin route handler**.

## Why it exists

Persona E (us). Keep scans succeeding, catch queue backlogs before customers do, manage the
tracker database, contain AI spend, investigate abuse, and support customers **without
impersonating them carelessly**.

## Dependencies

Everything. Build it last within Phase 6 — but it is XL, so parallelize it against 6.1–6.5.

## The 15 pages

| Page | Contents |
|---|---|
| `/admin` | Agencies by plan · active websites · scans today (succeeded/partial/failed) · failed-scan rate · critical issues today · AI spend today/MTD · MRR · queue depths · worker health · error rate · p95 API latency |
| `/admin/agencies` | Filter by plan/status/size/signup. Detail: profile, members, websites, usage vs. entitlements, billing state, scan history, AI spend, support notes. Actions: suspend, reactivate, extend trial, grant credits, change plan, **impersonate** |
| `/admin/users` | All users, memberships, last active, Clerk link, disable |
| `/admin/websites` | Cross-tenant; find problem sites (consecutive failures, chronic timeouts, bot-challenge sites); force re-scan; blocklist |
| `/admin/scans` | Filter by status/error category/duration/worker; detail plus worker logs and raw job payload |
| `/admin/queue` | Live BullMQ per queue: waiting/active/completed/failed/delayed/paused. Retry job, retry all failed, remove, pause/resume, drain. Job inspector: data, attempts, stack trace, timings |
| `/admin/issues` | **Cross-tenant rule analytics: firing frequency, FP feedback rate per rule, severity distribution** — the primary input for rule tuning |
| `/admin/trackers` | Vendor DB CRUD + bulk JSON + **unknown-domain queue** ranked by cross-tenant frequency |
| `/admin/ai-usage` | Requests, tokens, cost by feature/model/agency/day; error rate; latency p50/p95; top spenders; cap breaches |
| `/admin/billing` | Subscriptions, MRR/ARR, churn, failed payments, trials ending, **Stripe webhook event log with replay** |
| `/admin/system-health` | DB, Redis, S3, worker heartbeats, browser pool utilization, external-service status, recent incidents |
| `/admin/logs` | Audit log (all tenants, filterable) + system log stream with severity filter and full-text search |
| `/admin/feature-flags` | Global/plan/agency targeting, percentage rollout, **kill switches** |
| `/admin/settings` | Plan definitions, default entitlements, scanner defaults, AI model mapping, maintenance mode, announcement banner |

## Impersonation rules

**Time-limited · reason-required · heavily audit-logged.** Admin access is fully audit-logged
**including reads of tenant data** — not just writes. This is a trust and forensics
requirement, and it is what makes support access defensible if a customer ever asks.

## Build steps

- [x] `(admin)/layout.tsx` `SUPER_ADMIN` gate + **re-check in every admin route handler**
- [x] Audit-log middleware covering admin **reads**
- [x] The 15 pages above
- [x] Impersonation: time-limited session, mandatory reason, prominent banner while active
- [x] Distinct visual treatment (dark sidebar, "ADMIN" chip) so nobody confuses it with the
      customer app — see `UI_DESIGN_PROMPTS.md` §6

## Acceptance criteria

- [x] An admin can retry a failed job
- [x] An admin can add a tracker vendor and it takes effect without a deploy
- [x] Admin reads of tenant data are audit-logged
- [x] Impersonation requires a reason, expires, and is audit-logged
- [x] A non-`SUPER_ADMIN` user is blocked at the layout **and** at every route handler
- [x] The unknown-domain queue ranks by cross-tenant frequency
- [x] Feature-flag kill switches take effect within the 60 s cache window

## Tests required

| Level | What |
|---|---|
| Integration | Route-handler-level `SUPER_ADMIN` enforcement (not just layout) |
| Integration | Admin read produces an audit entry |
| E2E | Retry a failed job; create a vendor; toggle a flag |

## Traps

- Gating only in the layout is a classic hole — Server Actions and route handlers are reachable
  directly. Re-check in every handler.
- `/admin/issues` rule analytics is the highest-value page for product quality: it is how false
  positives get found before customers churn over them. Don't defer it as "just a report".
- The queue board must be safe: "drain" and "retry all failed" are destructive at scale.
  Confirm-by-typing, per the global destructive-action convention.
