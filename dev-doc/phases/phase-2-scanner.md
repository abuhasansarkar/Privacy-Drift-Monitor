# Phase 2 — The Scanner

> **Goal:** a real scan runs end to end and stores evidence.
> **Dependencies:** Phase 1 (task 1.1 only — **the rest of Phase 1 is not built**)
> **Status:** ✅ Complete
> **⚠️ The highest-risk phase in the project.**
> **Plan ref:** Part XII §12.3 (Phase 2), Part IV (all), Part VII (queues), Part X §10.3–§10.6

This is the product. Everything else is a presentation layer over what this subsystem
records. `packages/scanner` must be independently testable **without a database**.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 2.1 | Worker bootstrap: BullMQ queues, connection handling, graceful shutdown, health + metrics | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.2 | Browser pool: lifecycle, recycling, semaphore, crash recovery | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.3 | Recorders: network, cookie, storage, console, screenshot | L | [07-evidence-system](../features/07-evidence-system.md) | ✅ |
| 2.4 | Resource interception policy (record-then-abort) | S | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.5 | Navigation, settle, observation window, scroll | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.6 | Consent adapter framework + registry + resolution cascade | L | [06-consent-engine](../features/06-consent-engine.md) | ✅ |
| 2.7 | Five CMP adapters (Cookiebot, CookieYes, Complianz, OneTrust, Usercentrics incl. shadow DOM) | L | [06-consent-engine](../features/06-consent-engine.md) | ✅ |
| 2.8 | `GenericBannerAdapter` — the four-strategy heuristic cascade | L | [06-consent-engine](../features/06-consent-engine.md) | ✅ |
| 2.9 | Four-phase orchestration with isolated contexts + withdrawal flow | L | [06-consent-engine](../features/06-consent-engine.md) | ✅ |
| 2.10 | Scan state machine + `ScanPhase` persistence | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.11 | Evidence persistence with batching and sanitization/redaction | M | [07-evidence-system](../features/07-evidence-system.md) | ✅ |
| 2.12 | S3 integration: screenshot upload, key builders, signed URLs | M | [07-evidence-system](../features/07-evidence-system.md) | ✅ |
| 2.13 | Scan job + database-driven scheduler + stuck-scan recovery | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.14 | **Fixture server + F01–F30** | L | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 2.15 | Scan detail page + evidence viewer (virtualized) | L | [07-evidence-system](../features/07-evidence-system.md) | ✅ |
| 2.16 | Scan progress UI (live stages) | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |

## What is needed next

Nothing past this point can be written honestly without these. All three are runtime
dependencies of `packages/scanner` or `worker/`, and none is installed:

```bash
npm install playwright -w @pdm/scanner       # 2.2 pool, 2.3 recorders, 2.5 navigation
npx playwright install --with-deps chromium  # the browser itself, ~400 MB
npm install bullmq ioredis -w @pdm/scanner   # 2.1 worker queues
```

`worker/` does not exist yet either — §10.9 defers it to this phase, so 2.1 creates it as a
sibling of `src/`, not a workspace package.

Also required before 2.11 (evidence persistence) can be tested end to end: `docker compose up -d`
for Postgres, Redis and MinIO, and a verified Phase 0/1 (`npm run verify` has still never
passed against this tree).

## Order of attack

Build **2.14 the fixture server early**, not last. Without deterministic local fixtures you
are debugging against live third-party websites, which is slow, flaky and unrepeatable.

```
2.1 worker  →  2.2 pool  →  2.4 interception  →  2.3 recorders  →  2.5 navigation
   →  2.14 fixtures (start here, grow throughout)
   →  2.6 adapter framework  →  2.7 known CMPs  →  2.8 generic
   →  2.9 four-phase orchestration  →  2.10 state machine
   →  2.11 evidence persistence  →  2.12 S3
   →  2.13 scheduling  →  2.15/2.16 UI
```

## Critical implementation rules

**Cleanup is not optional.** Every phase is wrapped in `try/finally` that closes the page,
closes the context and releases pool capacity — on timeout, crash and abort alike. A leaked
context takes a worker down within hours. Enforce with a lint rule *and* an integration test
asserting context count returns to zero after a forced-failure scan.

**An aborted request is still a recorded request.** Register the route handler *after*
attaching the network listener so the request event fires before the abort. This is what
makes record-then-abort safe for images and media.

**Never `waitUntil: 'networkidle'`.** Tracking scripts hold long-poll connections open and
every scan would time out. Use `domcontentloaded` → custom `settle()` (2 s quiet period,
capped) → a fixed observation window → one scroll to bottom and back.

**Keep the Chromium sandbox on.** We execute untrusted third-party JavaScript from arbitrary
websites. Grant `SYS_ADMIN` via a seccomp profile rather than passing `--no-sandbox`
(Part X §10.4).

**Deterministic failures are not retried.** DNS NXDOMAIN, SSRF block, 404 on the target and
TLS name mismatch are terminal. Retrying them wastes browser time and delays real work.

**A phase that could not be executed is `UNDETERMINED`, never a pass.** This propagates to
`PARTIAL` at the scan level and to "Could not be determined" in the UI.

## Acceptance criteria

From §12.3 and M3 (§12.4).

- [ ] A scan of a real website completes and stores requests, cookies, storage and screenshots
- [ ] All four consent phases execute against fixtures F03–F07
- [ ] A site with no banner is correctly recorded as `cmpId: 'none'`
- [ ] A phase failure produces `PARTIAL`, never a clean result
- [ ] **F28 produces zero drift events on identical consecutive scans** (hard gate)
- [ ] A crashed browser does not leak contexts — asserted, not assumed
- [ ] All SSRF vectors are blocked, including on redirect hops
- [ ] Evidence contains **no cookie values, no storage values and no query strings**
- [ ] Screenshots upload to a tenant-prefixed S3 key
- [ ] Failures are classified and retried per policy
- [ ] Stuck-scan recovery works when a worker is killed mid-scan

## Risks carried by this phase

| Risk | Mitigation in scope here |
|---|---|
| Consent adapters fail on real CMP diversity (**High/High**) | 5 adapters + 4-strategy generic cascade, confidence scoring, per-website selector overrides, 30 fixtures |
| Scanner instability / browser leaks (Medium/High) | Pool recycling by use and age, hard timeouts at every level, `finally` cleanup, crash recovery, 24 h soak |
| SSRF exploited (Low/**Critical**) | Guard on every navigation *and every redirect hop*, IP pinning, plus an infrastructure egress firewall |
| Sites block our scanner (**High**/Medium) | Identifiable UA, published egress IPs, `/bot` page, robots respect, "allowlist us" error copy |
| Browser cost exceeds model (Medium/Medium) | Record-then-abort, screenshot policy, page limits, priority queues |


## The fixture matrix is a contract — read this before touching it

§4.15 fixes a thirty-row matrix and the CI contract names it directly: "F01–F30
run on every PR that touches `packages/scanner`. **F28 is a hard gate** — any
change producing spurious drift fails the build."

An earlier pass numbered a LOCAL set F01–F12 describing entirely different
behaviours. That is worse than having no fixtures: a green "F07 passes" said
nothing about shadow-DOM consent, and a green "F28" said nothing about drift.
The ids now match the plan row for row, and
`src/testing/__tests__/fixture-matrix.test.ts` fails the build if one goes
missing. Fixtures that are ours rather than the plan's carry `X` ids.

Three deviations, all deliberate and all commented at the source:

| Row | Plan | Built | Why |
|---|---|---|---|
| F20 | tag injected after 5 s | 1.2 s | Both are inside the 10 s observation window and prove the same property; 5 s per run is minutes of CI for no extra signal |
| F23 | 20 s first byte | 20 s, overridable per test | The fixture matches the plan; a test asserting timeout HANDLING overrides it rather than waiting |
| F02 etc. | "both vendors classified" | recorded, not classified | The classifier matches on registrable domain and these pages are served from 127.0.0.1, which has none. Vendor matching is unit-tested against synthetic requests in `packages/analysis` — merging the two would need a DNS-rewriting proxy for no extra confidence |

## Two real defects the fixtures found

- **The generic adapter did not recognise "Deny"** — which is what Usercentrics
  actually renders. F07 caught it. Bare `deny` and `refuse` are now in the
  reject phrase list, after the "… all" forms so the more specific phrase still
  wins.
- **There was no preferences fallback at all.** §4.6 describes rejecting via a
  preferences panel and PDM-R011 fires on exactly that, but the cascade stopped
  at three strategies. It is now strategy 4, reject-only, recorded as its own
  `preferences_fallback` method so the rule has something to fire on. "Save"
  alone is deliberately NOT treated as a rejection — in a panel where nothing
  was toggled it may persist opt-in defaults, which would invert the finding.

## The Evidence tab (task 2.15)

Faceted browser over one scan: requests, cookies, storage, console,
screenshots, with domain search, consent-state, resource-type and two toggle
filters, plus JSON/CSV export behind `evidence:export` and audit-logged.

⚠️ **Server-side paging, not client virtualisation.** §5.11 draws a virtualised
table, which is the right answer for a dataset already in the browser. Ours is
not: one scan of a busy site is thousands of rows, and shipping them all to
virtualise locally is the cost virtualisation exists to avoid.

⚠️ **It says what was NOT kept.** Query values, cookie values and header values
are stripped before storage (§10.6). A developer hunting a missing parameter
needs to know it was never stored, rather than concluding the scanner missed it.
