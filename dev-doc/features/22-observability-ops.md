# Feature 22 — Observability, Flags, Retention & Ops

> **Phase:** 0 (logging, health) → 6 (flags, retention, analytics) → 7 (dashboards, DR)
> **Priority:** P0/P1 · **Effort:** S + M + M + M · **Value:** 3–4
> **Status:** ⬜ Not started
> **Plan refs:** Part X (all), Part XI §11.13 (flags), Part XII §12.5

## What it is

The operational layer: structured logging, error tracking, metrics, health endpoints, feature
flags, analytics instrumentation, retention/cleanup jobs, counter reconciliation, backups and
DR.

## Why it exists

Persona E operates this platform. Every incident scenario in Part X §10.11 assumes we can
*detect* the problem — which requires this feature to exist before the incident, not after.

## Build steps

### Phase 0 — foundations
- [ ] `instrumentation.ts` — OpenTelemetry + `onRequestError`
- [ ] Pino structured logging, request-correlated
- [ ] Sentry
- [ ] `/api/health` and `/api/health/ready` **reporting dependency status**
- [ ] Error taxonomy with stable machine-readable codes (`packages/shared/src/errors.ts`)
- [ ] `handle(req, fn)` — the single API error boundary

### Phase 6 — flags, analytics, retention
- [ ] Feature flag service. Resolution: **agency override → plan targeting → percentage
      rollout (stable hash of `agencyId`) → global default.** Cached 60 s in Redis and in process
- [ ] Server-side `await isEnabled(FLAGS.X, agencyId)`; client-side via a flags object passed
      down from the app layout — **no flash of wrongly-gated content**
- [ ] `/admin/feature-flags` with targeting, percentage rollout and kill switches
- [ ] Every flag has an **owner and a removal date**
- [ ] Analytics instrumentation — every event named in Part III page specs
- [ ] **Retention/cleanup jobs** per data class
- [ ] Counter reconciliation job (denormalized counters drift under concurrency)

### Phase 7 — production
- [ ] Dashboards, alert routing, on-call path, runbooks
- [ ] Backups + PITR; **restore drill executed and documented**
- [ ] DR runbook written and walked through
- [ ] Autoscaling on queue depth
- [ ] Graceful shutdown verified — no jobs lost on deploy

## Flags as kill switches

| Flag | Operational use |
|---|---|
| `AI_AUTO_EXPLAIN` | Off stops **all automatic AI spend instantly** |
| `ADVANCED_SCAN` | Off reduces scanner load during an incident |
| `SCORING_ENGINE_V2` | Shadow mode — compute both, store both, compare, then flip |

Full list in `packages/shared/src/flags.ts` (Part XI §11.13).

## Retention rules

- [ ] Per-data-class retention periods (Part X); free-scan results purge at **7 days**
- [ ] **Retention deletes expired evidence but never evidence attached to an open issue** —
      this is a Phase 6 acceptance criterion and the easiest one to get wrong
- [ ] Retention periods are documented in `/legal/privacy` and must match the implementation

## Degraded-mode behaviour

Each of these is a designed state, not an outage page:

| Dependency down | Behaviour |
|---|---|
| Redis | **App stays readable.** Scan/report/AI enqueue returns 503 with a clear message; operator alert fires. Queued scans re-enqueue from Postgres on recovery — which is why scan intent lives in Postgres, not only Redis |
| S3 | Scans still complete; evidence rows persist; screenshot upload retries 5× then sets `screenshotsUnavailable` |
| AI provider | Circuit breaker opens. **Everything else continues.** AI sections show "temporarily unavailable" |
| Stripe | Existing subscriptions keep working; banner shown; **we never infer subscription state** |
| Resend | Emails delayed and retried ~2 h; **in-app notifications unaffected** |
| Clerk | New logins fail; existing JWT sessions continue; **portal unaffected** (separate auth) |
| Database | Total outage — maintenance page; workers stop claiming; jobs stay queued |

## Performance budgets

The full table is Part X §10.12; it is reproduced in
[phase-7](../phases/phase-7-hardening-launch.md). Enforced by Lighthouse CI on marketing, API
and DB histograms with alerts, and an E2E assertion for the evidence viewer at 5,000 rows.

## Acceptance criteria

- [ ] Health endpoints report real dependency status
- [ ] Structured logs ship and are searchable
- [ ] Metrics and dashboards live; alerts routed with an on-call path
- [ ] Flags resolve in the documented order and cache for 60 s
- [ ] Kill switches take effect within the cache window
- [ ] Retention deletes expired evidence but never evidence on an open issue
- [ ] Counter reconciliation runs and finds **zero** drift
- [ ] **Restore drill completed and documented**
- [ ] Graceful shutdown loses no jobs
- [ ] Every degraded mode above behaves as specified

## Traps

- A backup that has never been restored is not a backup. The quarterly restore drill is a
  scheduled calendar obligation with a written runbook.
- The off-provider logical dump is deliberate — it is the only backup that survives our hosting
  account being lost or compromised.
- Targets: **RPO < 5 minutes, RTO < 4 hours** for a full-region loss.
- Redis is deliberately **not** backed up: it holds only queue state and caches, both
  reconstructible. Don't "fix" that.
