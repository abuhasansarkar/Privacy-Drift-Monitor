# Phase 2 — The Scanner

> **Goal:** a real scan runs end to end and stores evidence.
> **Dependencies:** Phase 1 · **Status:** ⬜ Not started
> **⚠️ The highest-risk phase in the project.**
> **Plan ref:** Part XII §12.3 (Phase 2), Part IV (all), Part VII (queues), Part X §10.3–§10.6

This is the product. Everything else is a presentation layer over what this subsystem
records. `packages/scanner` must be independently testable **without a database**.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 2.1 | Worker bootstrap: BullMQ queues, connection handling, graceful shutdown, health + metrics | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.2 | Browser pool: lifecycle, recycling, semaphore, crash recovery | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.3 | Recorders: network, cookie, storage, console, screenshot | L | [07-evidence-system](../features/07-evidence-system.md) | ⬜ |
| 2.4 | Resource interception policy (record-then-abort) | S | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.5 | Navigation, settle, observation window, scroll | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.6 | Consent adapter framework + registry + resolution cascade | L | [06-consent-engine](../features/06-consent-engine.md) | ⬜ |
| 2.7 | Five CMP adapters (Cookiebot, CookieYes, Complianz, OneTrust, Usercentrics incl. shadow DOM) | L | [06-consent-engine](../features/06-consent-engine.md) | ⬜ |
| 2.8 | `GenericBannerAdapter` — the four-strategy heuristic cascade | L | [06-consent-engine](../features/06-consent-engine.md) | ⬜ |
| 2.9 | Four-phase orchestration with isolated contexts + withdrawal flow | L | [06-consent-engine](../features/06-consent-engine.md) | ⬜ |
| 2.10 | Scan state machine + `ScanPhase` persistence | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.11 | Evidence persistence with batching and sanitization/redaction | M | [07-evidence-system](../features/07-evidence-system.md) | ⬜ |
| 2.12 | S3 integration: screenshot upload, key builders, signed URLs | M | [07-evidence-system](../features/07-evidence-system.md) | ⬜ |
| 2.13 | Scan job + database-driven scheduler + stuck-scan recovery | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.14 | **Fixture server + F01–F30** | L | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |
| 2.15 | Scan detail page + evidence viewer (virtualized) | L | [07-evidence-system](../features/07-evidence-system.md) | ⬜ |
| 2.16 | Scan progress UI (live stages) | M | [05-scan-engine](../features/05-scan-engine.md) | ⬜ |

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
