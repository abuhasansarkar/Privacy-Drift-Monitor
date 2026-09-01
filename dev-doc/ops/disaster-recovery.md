# Disaster recovery

> **Plan ref:** Part X §10.10, Part XII §12.3 (Phase 7 task 7.5)

## What can actually go wrong, in order of likelihood

The product's dependencies fail in very different ways, and the response to each is different.
§10.11 already fixes the degradation model; this page is the human procedure.

| Failure | Blast radius | Product behaviour | First action |
|---|---|---|---|
| Redis down | Queues stop; caches miss | **App still serves.** Reads work; enqueueing returns 503 with a clear message | Restart Redis. Nothing is lost — BullMQ jobs are in Redis, so in-flight work IS lost and re-enqueued by the scheduler on the next sweep |
| Object storage down | Screenshots unavailable | **Scans still complete.** Evidence rows persist; upload retries | Nothing urgent. Verify credentials before assuming an outage |
| Postgres down | Total | App returns 503 from the readiness probe and leaves rotation | Below |
| Worker wedged | Scans stop silently | **The dangerous one** — see below | Below |
| Stripe down | No checkout, no portal | Existing subscriptions keep working; a banner explains | Nothing. The daily reconciliation catches up |
| Clerk down | No new sign-ins | Existing sessions keep working until they expire | Nothing we can do; status page |
| OpenAI down | No new explanations | **Every finding still renders** (P3) | Nothing |

## The dangerous failure is the quiet one

A worker that is alive and wedged — a leaked browser context, an exhausted pool — writes
heartbeats forever and completes nothing. **Nothing in the customer-facing UI says so**; a site
that has stopped being monitored looks exactly like a site with no findings.

Two things catch it, and both are already running:

- `/admin/system-health` reports **scans finished per worker in the last hour**, not heartbeats.
  A worker with zero completions and a non-zero `RUNNING` count is wedged.
- `recoverStuckScans()` in the scheduler reclaims a scan stuck in `RUNNING` past
  `SCAN_STUCK_AFTER_MS` (30 min default). Without it the in-flight check refuses to schedule
  that website **ever again**.

**Response:** restart the worker. Scans in flight are reclaimed as `FAILED` with
`SCAN_TIMEOUT` and picked up on the next sweep. There is no state to repair.

## Postgres loss

1. **Confirm it is really gone.** `/api/health/ready` returns 503 with `postgres.ok: false`.
   Check the managed instance's own status before assuming the worst — the app cannot tell a
   dead database from a network partition.
2. **Do not fail over manually if the platform does it.** Two writers is worse than no writer.
3. **If restoring from backup:** follow `backup-and-restore.md`. Restore into a NEW database and
   repoint `DATABASE_URL`; never restore over a database that might come back.
4. **After restore, before traffic:**
   - `npm run db:migrate` — the dump may predate the current schema
   - Verify the three reference tables are populated (`restore-drill.sh` checks this)
   - Run the Stripe reconciliation manually — the projection is now as stale as the dump, and
     §9.1's whole point is that Stripe is authoritative
   - Expect duplicate scans: `nextScanAt` has rewound, and the scheduler will re-enqueue

## What we lose, by data class

Stated plainly because "how much did we lose" is the first question and guessing is worse than
an honest number.

| Data | Recoverable from | Loss window |
|---|---|---|
| Agencies, users, memberships | Clerk (source of truth) + backup | Reconcilable to zero |
| Subscriptions, plans | **Stripe** (source of truth, §9.1) | Reconcilable to zero |
| Websites, clients, settings | Backup only | Since last backup |
| Scans, evidence, issues, drift | Backup only | Since last backup — **unrepeatable**, a scan records a moment |
| Screenshots | Object storage (separate lifecycle) | Usually survives a database loss |
| Queued jobs | Nothing | All in-flight work |

**Scan evidence is the only unrepeatable data in the system.** Everything else can be recreated
or re-fetched; a recording of what a website did last Tuesday cannot.

## Walkthrough log

| Date | Scenario | Outcome |
|---|---|---|
| 2026-09-01 | Restore from dump into a scratch database | ✅ Executed — see `backup-and-restore.md`. Found three script defects |
| 2026-09-01 | Worker killed mid-scan | ✅ Executed — `npx tsx worker/src/stuck-scan.drill.ts`. Orphaned RUNNING scan reclaimed as `FAILED`/`SCAN_TIMEOUT`, and the website freed for scheduling (0 in flight) |
| — | Redis loss with the app serving | ⬜ Not yet executed |
| — | Full region failover | ⬜ Requires production infrastructure |

**This runbook has not been walked through end to end.** §12.3 task 7.5 asks for a walkthrough;
the restore and the worker-kill steps have been performed, the Redis-loss and region-failover
steps have not. The second of those needs production infrastructure that does not exist.
