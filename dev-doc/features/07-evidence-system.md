# Feature 07 — Evidence System

> **Phase:** 2 · **Priority:** P0 · **Effort:** L · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part IV §4.5 (instrumentation), Part X §10.6 (redaction), Part III §3.9

## What it is

The recorders (network, cookie, storage, console, screenshot), the `EvidenceCollector` that
normalizes, redacts and tags everything with consent state, persistence to Postgres and S3,
and the virtualized evidence viewer.

## Why it exists

Persona C (developer) is "deeply skeptical of automated scanners" and will not act on an
unevidenced claim. Design principle: **evidence is always one click away.** Every claim the UI
makes traces to a recorded browser event.

## Dependencies

Features 05 (scan engine), 06 (consent phases, for tagging). Blocks: features 08–11, 16.

## The hard boundary

`EvidenceCollector` is the last thing that may **add** facts. Everything downstream — the
classifier, rule engine, drift engine, risk engine — only *interprets*. This is what makes the
pipeline replayable: given stored raw evidence, re-running analysis must produce identical
findings, which is how rules get tuned safely (Part IV §4.14).

## Build steps

- [ ] **NetworkRecorder** — `page.on('request'|'response'|'requestfailed')` plus a CDP session
      for redirect chains. Attached **before** navigation
- [ ] **CookieRecorder** — full attributes, attributed to consent state
- [ ] **StorageRecorder** — localStorage + sessionStorage keys
- [ ] **ConsoleRecorder** — console errors and page errors (essential for explaining a `PARTIAL`)
- [ ] **ScreenshotCapture** — banner state per phase; a second lightweight pass with images
      allowed so visual evidence stays usable
- [ ] `EvidenceCollector` — normalize, redact, tag with consent state
- [ ] `privacy/sanitize.ts` — `sanitizeUrl`, `redactValue`
- [ ] Batched persistence (`createMany` in 1,000-row chunks)
- [ ] S3: key builders (**tenant-prefixed**), upload with retry (5×), signed URLs via
      `getSignedUrl(agencyId, key, ttl)` with the tenant asserted
- [ ] Evidence viewer: virtualized table (TanStack Virtual), server-side pagination at
      200/page, lazy-load bodies on expand
- [ ] Faceted filters: domain, resource type, consent state, third-party, tracker-matched
- [ ] Row expansion: method, status, resource type, **initiator chain**, timestamp offset,
      size, matched tracker, redacted headers summary
- [ ] Export as JSON/CSV — permission-gated **and audit-logged**

## Data minimization — non-negotiable

Storing client-site PII is a **Critical-impact** risk (§12.7). The mitigation is aggressive
minimization at capture time:

- ❌ **No request/response bodies**
- ❌ **No cookie values** — names and attributes only
- ❌ **No storage values** — keys and truncated/redacted values only
- ❌ **No query strings** — sanitized out of stored URLs
- ✅ Screenshot redaction
- ✅ Encryption at rest
- ✅ Retention enforcement (feature 22)

Minimization is what limits blast radius if there is ever an incident. It is also why
"evidence contains no cookie values, no storage values and no query strings" is a Phase 2
acceptance criterion.

## Acceptance criteria

- [ ] Requests, cookies, storage, console and screenshots all persist for a real scan
- [ ] Every record is tagged with the consent phase it occurred under
- [ ] **Evidence contains no cookie values, no storage values and no query strings**
- [ ] Screenshots upload to a tenant-prefixed S3 key and are served by signed URL
- [ ] The evidence viewer handles 5,000 rows at **< 100 ms per interaction**
- [ ] An aborted (image/media) request is still recorded
- [ ] Evidence export is permission-gated and audit-logged

## Tests required

| Level | What |
|---|---|
| Unit | `sanitizeUrl` / `redactValue` — assert query strings and values are stripped |
| Integration | Batched insert of a 5,000-request scan; S3 via MinIO; signed-URL tenant assertion |
| E2E | Evidence viewer performance against a seeded 5,000-request scan |

## Failure modes

| Mode | Handling |
|---|---|
| S3 outage | Evidence rows still persist (they are in Postgres). Screenshot upload retries 5×, then the scan completes with `screenshotsUnavailable` set. A maintenance job re-uploads buffered screenshots |
| Scan produces 50,000 requests | Batched inserts, server-side pagination; consider a per-scan cap and record that it was hit |

## Traps

- Attach recorders **before** navigation or you miss the first requests — which are the ones
  that matter most for "before consent".
- The initiator chain is what proves *why* a request happened (e.g. GTM injected it). Capture
  it; it is the difference between evidence and an assertion.
- Headers are stored **redacted** per Part X §10.6 — do not persist raw auth or cookie headers.
