# Feature 05 — Scan Engine

> **Phase:** 2 · **Priority:** P0 · **Effort:** XL · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part IV §4.1–§4.5, §4.15 (fixtures), Part VII (queues, scheduler, retries)

## What it is

The Playwright/Chromium engine: browser pool, resource interception, navigation strategy,
scan state machine, the BullMQ job and scheduler, and the fixture suite that keeps it honest.
Lives in `packages/scanner`, imported by `apps/worker`, **independently testable without a
database**.

## Why it exists

A static HTML fetch cannot see GTM-injected pixels, lazy-loaded widgets or SPA-route
tracking. Runtime browser execution is the entire technical premise of the product.

## Dependencies

Feature 04 (SSRF guard). Blocks: features 06, 07, and everything in Phase 3.

## Public interface

```ts
runScan(input): Promise<ScanResult>              // orchestrator.ts
BrowserPool { acquire, release, drain, stats }   // browser/pool.ts
```

## Build steps

### Worker + queues
- [ ] BullMQ queue definitions, connection handling, `WORKER_ROLES` selecting consumed queues
- [ ] Graceful shutdown — **no jobs lost on deploy**
- [ ] Health + metrics server, heartbeats
- [ ] Separate queues; the free-scan queue is isolated and low-priority (feature 18)

### Browser pool
- [ ] `SCAN_BROWSER_POOL_SIZE` (default 2) long-lived Chromium instances
- [ ] **Reuse browsers, never reuse contexts** — a context is ~30 ms and gives full storage isolation
- [ ] Recycle after `SCAN_BROWSER_MAX_USES` (50) or `SCAN_BROWSER_MAX_AGE_MS` (30 min);
      Chromium leaks over long sessions
- [ ] Crash handling: remove and replace; in-flight scans fail `BROWSER_CRASHED` and retry on
      a different browser
- [ ] Semaphore-bounded acquisition; 60 s timeout → `BROWSER_POOL_TIMEOUT`, retry with backoff
- [ ] Launch args and context options exactly as Part IV §4.2 (keep `chromiumSandbox: true`,
      `serviceWorkers: 'block'`, `ignoreHTTPSErrors: false`, `bypassCSP: false`,
      `reducedMotion: 'reduce'`)

### Interception
- [ ] Record-then-abort policy per the table in Part IV §4.3
- [ ] **Register the route handler *after* attaching the network listener** so the request
      event fires before the abort
- [ ] `SCAN_BLOCK_MEDIA` (default true), overridable per website

### Navigation
- [ ] `goto` with `domcontentloaded` — **never `networkidle`**
- [ ] Custom `settle()`: 2 s quiet period on our own request counter, capped at `SCAN_SETTLE_MAX_MS`
- [ ] Fixed 10 s observation window for late-firing GTM pixels
- [ ] Scroll to bottom and back — lazy-loaded widgets and scroll-triggered pixels are frequent findings
- [ ] All eight timeout levels from Part IV §4.4

### State machine + jobs
- [ ] Scan state machine + `ScanPhase` persistence
- [ ] Scan job (orchestration only) — **analysis and drift are separate jobs** so a rule
      exception can't fail a good scan
- [ ] Database-driven scheduler (scan intent lives in Postgres, not only Redis)
- [ ] Stuck-scan recovery sweep — resets `RUNNING` rows, re-enqueues `QUEUED`
- [ ] Retry policy: 2 in-job navigation retries for transient classes (`ECONNRESET`,
      `ETIMEDOUT`, 502/503/504) at 2 s then 5 s. **Deterministic failures are not retried**
      (DNS NXDOMAIN, SSRF block, 404, TLS name mismatch)

### Fixtures — start early
- [ ] Local fixture server + F01–F30 (Part IV §4.15)
- [ ] **F28 (zero spurious drift on identical scans) is a hard CI gate**

### UI
- [ ] Scan progress panel with live stages and per-stage findings (Part XI §11.7) — polled
      every 2 s, SSE in V1.1
- [ ] Scan detail page (Part III §3.9)

## The cleanup contract

Every phase wrapped in `try/finally` closing the page, closing the context and releasing pool
capacity — on timeout, crash and abort alike. **Enforced by a lint rule and an integration
test asserting context count returns to zero after a forced-failure scan.** A leaked context
takes a worker down within hours.

## User agent policy

A real current Chrome UA with `PrivacyDriftMonitor/1.0 (+https://<app>/bot)` appended. We must
be identifiable (ethical, and it lets site owners allowlist us) without being so unusual that
CMPs behave differently. `SCAN_RESPECT_ROBOTS` defaults to **true**; disabling it per-website
requires confirmed ownership and is audit-logged.

## Acceptance criteria

- [ ] A scan of a real website completes and stores requests, cookies, storage, screenshots
- [ ] A phase failure produces `PARTIAL`, never a clean result
- [ ] A crashed browser does not leak contexts (asserted)
- [ ] F28 produces zero drift events on identical consecutive scans
- [ ] Failures are classified; deterministic failures are not retried
- [ ] Stuck-scan recovery verified by killing a worker mid-scan
- [ ] Browser workers stable over a 24-hour soak with no memory growth

## Tests required

| Level | What |
|---|---|
| Unit | State machine, retry classification, timeout enforcement |
| Integration | Context count returns to zero after forced failure; BullMQ round-trips |
| Fixtures | F01–F30, F28 as a hard gate |
| Load | 100 concurrent scans (k6, pre-release) |

## Traps

- `networkidle` will time out on any site holding a long-poll connection — which is most sites
  with tracking.
- Blocking a script to save bandwidth means **failing to observe a tracker**. Only image and
  media *bodies* are aborted, and only after the request is recorded.
- Do not pass `--no-sandbox`. We run untrusted third-party JS; use `SYS_ADMIN` + seccomp
  (Part X §10.4).
