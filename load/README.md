# Load testing

> **Plan ref:** Part X §10.12 (budgets), Part XII §12.3 (Phase 7 task 7.2)

## Running

```bash
brew install k6          # or https://k6.io/docs/get-started/installation/
k6 run load/marketing.js
k6 run load/api-reads.js       # needs E2E_SESSION_COOKIE
k6 run load/free-scanner.js    # ⚠️ read the warning in that file first
```

`BASE_URL` defaults to `http://localhost:3000`.

## The budgets are gates, not aspirations

From §10.12. Each script encodes the relevant ones as k6 `thresholds`, so a run **fails** rather
than printing numbers somebody has to interpret.

| Surface | Target |
|---|---|
| Marketing LCP | < 2.0 s |
| App dashboard TTI | < 2.5 s warm |
| App list pages TTFB | p95 < 400 ms |
| API reads | p95 < 300 ms, p99 < 800 ms |
| API writes | p95 < 500 ms |
| DB queries | p95 < 100 ms, p99 < 300 ms |
| Scan (4 phases, 1 page) | p50 < 150 s, p95 < 400 s |
| Report generation | p50 < 30 s, p95 < 120 s |
| AI call | p95 < 8 s |

## What these scripts do NOT measure

Stated because a green k6 run is easy to over-read.

- **LCP and TTI are browser metrics.** k6 measures TTFB and response time; it does not render.
  Those two budgets need Lighthouse or a real-user measurement, not this.
- **Scan and report latency are worker-side**, bounded by Chromium, not by HTTP. §10.12's
  100-concurrent-scans scenario needs the worker pool under load, which is a
  `k6 run load/scan-enqueue.js` plus watching `/admin/queue` — the numbers come from the `Scan`
  rows afterwards, not from k6.
- **A local run proves nothing about production.** Same machine, same Postgres, no network. It
  catches an accidental N+1 or a missing index; it does not tell you what the box will do.

## Results

| Date | Scenario | Result |
|---|---|---|
| — | 50 concurrent dashboard users | ⬜ Not yet run against a production-like environment |
| — | 100 concurrent scans | ⬜ Needs worker capacity that does not exist locally |
