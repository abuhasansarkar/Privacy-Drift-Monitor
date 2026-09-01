# Runbooks

> **Plan ref:** Part X §10.8, §10.11, §10.12, Part XII §12.3 (Phase 7 task 7.3)

Written to be followed at 3 a.m. by someone who did not build the thing. Each one starts with
how you know it is happening, because the alert is usually the last thing to fire.

---

## Scans are failing

**How you know.** `/admin` → failed-scan rate. §10.12 budgets 5%; above 15% somebody should be
looking now. **`PARTIAL` is not a failure** and is excluded from that number — a site that
ships a banner with no reject button produces a partial scan every time, and counting it would
make the metric jump for a finding rather than an incident.

**Establish the shape first.** `/admin/scans?status=FAILED` shows the worker id on every row.

- Failures **clustered on one worker** → infrastructure. Restart that replica.
- Failures **spread evenly** → code or a dependency. Read the error codes.
- Failures **clustered on one agency or domain** → that site, not us. `/admin/websites` ranks by
  consecutive failures.

**By error code:**

| Code | Meaning | Action |
|---|---|---|
| `NAV_TIMEOUT` | Our budget ran out | Site is slow, or the pool is starved. Check queue depth first |
| `DNS_NXDOMAIN` | Domain does not resolve | Customer's problem. The `website-unreachable` email has already gone |
| `SSRF_BLOCKED` | The guard refused the address | **Look at it.** Either a customer pointed us somewhere internal, or somebody is probing |
| `BOT_CHALLENGE` | Cloudflare or similar | Nothing to fix. Expected on some sites |
| `BROWSER_CRASHED` | Chromium died | If repeated on one worker, it is leaking. Restart and watch memory |

---

## The queue is backing up

**How you know.** `/admin` → queue depths, or a customer saying a scan never ran.

**The queues are separate on purpose** (§7.1), so read which one:

- `pdm-scan` deep → not enough browser capacity, or scans are slow. Check the failure rate at
  the same time; a backlog with a high failure rate is usually retries.
- `pdm-scan-free` deep → **ignore it.** It is capped and cannot starve the paid queue. If it
  sits above 200, submissions are already being refused with "high demand".
- `pdm-email` deep → Resend outage or a bad key. Emails retry; nothing is lost.
- `pdm-ai` deep → provider rate limiting. Costs money to drain; check `/admin/ai-usage` first.

**Pause before you drain.** `/admin/queue` has both. Pausing stops consumption and keeps the
jobs; **draining discards every waiting job and cannot be undone** — scans a customer is
waiting for, emails that will never be sent. It confirms by typing the queue name, on the
server as well as in the dialog.

---

## A worker is alive and doing nothing

**The most dangerous state in the system**, because it looks like everything working.

**How you know.** `/admin/system-health` reports scans *finished per worker in the last hour* —
deliberately not heartbeats, because a wedged worker writes those forever. A worker with zero
completions and a non-zero running count is wedged.

**Action.** Restart it. `recoverStuckScans()` reclaims anything left in `RUNNING` past
`SCAN_STUCK_AFTER_MS` and frees the website for scheduling. Verified by
`npx tsx worker/src/stuck-scan.drill.ts`.

**The underlying cause is almost always a leaked browser context.** AGENTS.md: "a leaked context
takes down a worker within hours." Every phase is wrapped in `try/finally` that closes the page,
closes the context and releases pool capacity; if this recurs, that is where to look.

---

## Billing looks wrong for one customer

**Never fix it by editing our tables.** §9.1 makes Stripe the source of truth and the webhook
the only writer. Our `Subscription` row is a projection.

1. `/admin/billing` → the Stripe webhook event log. A row with `attempts: 8` and an error is the
   answer most of the time.
2. **Replay the event** from that table. It re-runs our handler over the stored payload and is
   idempotent — pressing it twice is a no-op.
3. If no event exists, the webhook never arrived. The daily reconciliation catches this within
   24 h; run it early rather than editing a row.
4. Only then consider an entitlement override on the agency, which is additive and audited.

---

## AI spend is climbing

**How you know.** `/admin` → AI spend today / MTD, or `/admin/ai-usage` → top spenders.

**The kill switch is `ai_auto_explain`** on `/admin/feature-flags`. Turning it off stops all
*automatic* spend — the auto-explain of critical issues, which §8.9 names as "the main
uncontrolled cost vector". It takes effect within the resolver's cache window. Turning a kill
switch **off** needs no confirmation, deliberately: at 3 a.m. the emergency stop must be one
click.

Per-agency runaway → check their credit cap in `/admin/agencies/[id]`. Explanations served from
cache cost nothing, so a high request count with low cost is fine.

---

## Everything is 503

**Check `/api/health/ready` first.** It reports each dependency separately, and §10.11's
degradation model is not intuitive:

- **Postgres down → not ready.** The only fatal dependency. See `disaster-recovery.md`.
- **Redis down → still ready.** Reads work, enqueueing returns a clear 503. The app is
  deliberately kept in rotation, because taking it out removes the page that would explain why.
- **Object storage down → still ready.** Scans complete, evidence persists, uploads retry.

If the probe says everything is reachable and the app is still 503, it is the app: read
`/admin/logs` at `error`.

---

## Alerting — NOT YET CONFIGURED

§10.8 asks for dashboards and alert routing. What exists is the data behind them:
`/admin/system-health`, `/admin` and `SystemLog`. Sentry is wired (`instrumentation.ts`,
`onRequestError`) and inert until `SENTRY_DSN` is set.

- [ ] `SENTRY_DSN` set in production
- [ ] Alert on failed-scan rate > 15% for 15 minutes
- [ ] Alert on any queue's waiting count > 500 for 10 minutes
- [ ] Alert on a worker with zero completions and non-zero running for 30 minutes
- [ ] Alert on the counter reconciliation finding non-zero drift (feature doc 17 asks for this
      specifically)
- [ ] Alert routing to a person, not a channel nobody reads
