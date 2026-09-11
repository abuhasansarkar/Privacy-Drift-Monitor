# FIXING.md — full-app defect register and fix plan

**Produced:** 2026-09-10, from a nine-pass full-app review (security, API routes,
scanner/worker pipeline, rules engine + AI, billing/entitlements, database/tenant
layer, email/reports/storage/notifications, frontend/UI, test suite/CI). Every
finding below was verified by reading the actual code path — no `PLAN.md §`
citations, no comment-trusting.

**How to use this file:**

- Each finding has a stable id (`F-001`…). When you pick one up, file a
  `dev-doc/tasks/` entry for it (per repo convention) and record acceptance
  evidence there. **`BUILT` is not `DONE`** — the acceptance run goes in the
  task file.
- Fix order is the wave plan at the bottom, not the id order.
- "Verify:" lines name the concrete check that proves the fix. A fix whose
  verification is "it compiles" is not done.
- Severity reflects blast radius *today*, not effort. Several one-line fixes are
  Critical because what they fix is a customer-visible lie.

**Environment note (2026-09-10):** `npm run verify` could not be run during the
review because `next dev` and the worker (`tsx watch src/index.ts`) hold
`node_modules/.prisma/client/query_engine-windows.dll.node` open —
`prisma generate` fails with `EPERM` on the DLL rename. Stop both processes
before running the gates. This is a local lock, not a repo defect.

---

## Severity definitions

| Tier | Meaning |
|---|---|
| **Critical** | The product is stating something untrue to users (invented facts, unfireable rules counted as working), or a product rule (AGENTS.md "Non-negotiable") is violated on a live surface. |
| **High** | Exploitable, data-loss, or permanently-breaking failure paths; paid-feature leakage; tenant-isolation weakened below the data-access-layer contract. |
| **Medium** | Wrong behavior reachable by realistic inputs/sequences; reliability and honesty defects with bounded blast radius. |
| **Low** | Hardening, consistency, convention, and latent-shape issues. Fix opportunistically or in a hygiene wave. |

---

# Tier 0 — Critical

## F-001 · Four registered rules can never fire (R029, R041, R043, R045)

- **Where:** `packages/analysis/src/rules/advanced.ts:334` (R029 `context.domGating`), `:425`
  (R041 `context.buttonGeometry`), `:458` (R043 `context.formSubmission`), `:495`
  (R045 `context.fingerprint`); builders at `worker/src/analysis.ts:346-388` and
  `worker/src/jobs/free-scan.ts:195-210`.
- **What:** The scanner *does* measure `domGating`, `buttonGeometry` and `fingerprint`
  (`packages/scanner/src/phase-runner.ts:187-192,216,242-248`), but the facts die in
  memory: the `ScanPhase` model has no columns for them, `persist()` drops them, and
  neither `RuleContext` builder passes them. `formSubmission` is never even collected —
  `runSyntheticFormInteraction` (`packages/scanner/src/consent/interactive-runner.ts:19`)
  is exported and called from nowhere, and its result shape doesn't match the
  `FormSubmissionFacts` the rule reads (`formFound/burstRequestsDetected/burstTrackerDomains`
  vs the rule's expectation). Meanwhile `DORMANT_RULE_IDS` and `RESERVED_RULE_IDS` are
  both `{}` and the contract test pins them empty
  (`packages/analysis/src/__tests__/rules.test.ts:257-263`), so the inventory claims 52
  live rules.
- **Why it matters:** This is the repo's own defined defect class — "a registered rule
  that cannot fire is a defect, not a placeholder" — in the exact shape that shipped
  once before. A site with a full-screen cookie wall or a 5×-padded Accept button
  silently scores as if neither exists.
- **Fix:**
  1. Add columns to `ScanPhase` (or a `PhaseFact` JSON column per phase) for
     `domGating`, `buttonGeometry`, `fingerprint`; persist from `phase-runner` output.
  2. Wire `runSyntheticFormInteraction` into the interactive phase; align its result
     with `FormSubmissionFacts`; persist.
  3. Populate all four fields in both RuleContext builders.
  4. Update the fixture matrix so at least one fixture exercises each fact end-to-end.
- **Verify:** An analysis run over a fixture with a cookie wall emits the R029 finding;
  a forced-failure scan on the same fixture does not. Count of registered-but-unfireable
  rules, checked by a new test that asserts each `RULES` entry's context fields appear
  in at least one populated RuleContext construction — goes to zero.

## F-002 · MCP server has no tenant scoping

- **Where:** `packages/mcp/src/tools.ts:103` (`unsafeGlobalClient("mcp-server")`); tools at
  `:111-131`, `:142-167`, `:174-212`, `:245-272`.
- **What:** `pdm_list_websites` with no `agencyId` argument returns the 100 most recent
  websites across **every** agency (including `url`, `healthScore`, `agencyId`);
  `pdm_get_drift_timeline` and `pdm_inspect_issue_evidence` resolve any
  `websiteId`/`issueId` globally — the latter returns full evidence records for another
  tenant's findings. `pdm_trigger_scan`'s "direct database fallback" creates a `Scan` row
  for any website id. `ToolContext` has an authenticated `apiKey` path, but nothing
  enforces it; a server started with `DATABASE_URL` and no `PDM_API_KEY` silently drops
  to the global-DB path.
- **Why it matters:** Product rule 4 — tenant isolation at the data-access layer —
  violated by a shippable surface.
- **Fix:** Require an API key at startup (refuse to boot without one, or a `--tenant
  agencyId` dev flag); resolve the key via the same `authenticateApiKey` machinery;
  run every tool through tenant-scoped repositories (`forAgency(agencyId)`), never the
  global client. Remove the DB fallback in `pdm_trigger_scan`.
- **Verify:** Start the MCP server without credentials → it refuses to start. With a key
  for agency A, `pdm_list_websites` returns only A's rows; a B-owned issue id errors.

## F-003 · `destinationCountry` is fabricated; PDM-R040 publishes the fabrication

- **Where:** `packages/scanner/src/net/geoip.ts:47-81`; producer call site
  `packages/scanner/src/record/recorders.ts:191-196`; consumer `PDM-R040`
  (`packages/analysis/src/rules/advanced.ts:362-410`).
- **What:** With no resolver injected (the production path calls `resolveDestinationCountry`
  bare), every valid public IP falls through the `US_IP_PREFIXES` list to
  `return "US"`, and every non-matching hostname also returns `"US"`. There is no GeoIP
  database anywhere in the repo. R040 then treats "US" as non-EEA and raises MEDIUM
  "Cross-Border Data Transfer to Non-EEA Destination (US)" for essentially any site with
  a pre-consent third-party request. The persisted `NetworkRequest.destinationCountry`
  column is noise, not evidence.
- **Why it matters:** Defect-#13 shape — a rule asserting a fact no instrument recorded —
  shipping as a customer-visible finding on virtually every scan.
- **Fix (choose one, be explicit in copy):**
  1. Wire a real resolver (e.g. MaxMind GeoLite2, self-hosted — a privacy product cannot
     ship an IP to a lookup CDN) and mark rows `COULD_NOT_BE_DETERMINED` when it is
     unavailable; **or**
  2. Remove the fabrication: stop writing the column until a resolver exists, move R040
     to `DORMANT_RULE_IDS` with its evidence requirement written next to it.
- **Verify:** No rule output may name a destination country unless a resolver ran;
  greppable: `resolveDestinationCountry` has a real data source behind it, or the column
  is null and R040 dormant.

## F-004 · `apiAccess` and `webhooks` entitlements are never enforced (plus four advertised limits)

- **Where:** Key creation `src/server/actions/api-settings.ts:12-32` (checks only
  `requirePermission("settings:update")`); key use `src/server/auth/api-auth.ts`
  (verifies hash, expiry, agency status — never entitlements); webhook creation
  `src/server/actions/api-settings.ts:47-74` → `src/server/services/webhook-service.ts:62-103`;
  catalogue `packages/billing/src/catalogue.ts:74,115,153-156`.
- **What:** `apiAccess: false` on Starter/Growth and `webhooks: true` only on
  Agency/Scale — but any plan can mint a `pdm_live_` key (full read/write API v1
  including scan triggering) and register outbound webhook endpoints that receive
  `website.scan.completed` / `privacy_drift.detected` deliveries. Also advertised but
  enforced nowhere: `maxClients` (pricing table promises 10/40/120;
  `createClient` has no capacity check and no `METRIC_LIMIT_KEY` entry),
  `scanPriority` (`createWebsite` writes any schema-accepted value; scheduler orders by
  it — a Starter site can self-assign HIGH), `maxPagesPerScan` and `maxConcurrentScans`
  (catalogue-only; never reach the scanner or pool).
- **Why it matters:** The white-label defect's exact shape — a paid feature wired
  without a resolver check — twice over, plus a pricing page promising limits that do
  not exist.
- **Fix:** Add `requireFeature(agencyId, "apiAccess")` to key create (and decide the
  story for *existing* keys — revoke or grandfather); `requireFeature(agencyId,
  "webhooks")` to endpoint create; add a `CLIENTS` metric limit to `usage.ts` and check
  it in `createClient`; gate `scanPriority` acceptance on entitlement; thread
  `maxPagesPerScan` from plan to `runScan`; document `maxConcurrentScans` as
  infrastructure-level until it is real, and remove it from the pricing page if it stays
  unenforced.
- **Verify:** A Starter test agency cannot create a key or webhook endpoint (403 with a
  stable error code); `createClient` past the plan cap fails with `QUOTA_EXCEEDED`;
  `scanPriority: "HIGH"` from a Starter agency is rejected or coerced.

---

# Tier 1 — High

## F-005 · Browser pool bricks itself after a browser crash

- **Where:** `packages/scanner/src/browser/pool.ts:180-205` (increment at `:183` before
  `await browser.newContext()` at `:185`); the guard that makes the leak fatal is
  `ensureBrowser`'s `if (this.browser && this.activeContexts > 0) return;` (`:132`).
- **What:** If `newContext()` throws (a crashed/disconnected Chromium does exactly this),
  `context` stays null and the `finally` decrement is skipped — `activeContexts` is
  permanently inflated. From then on `ensureBrowser` refuses to replace the dead
  browser, every future scan fails until process restart, and `pool.close()` burns its
  full 30 s timeout.
- **Fix:** Decrement unconditionally in `finally` (count the attempt, not the context);
  add a test that `newContext` throwing leaves the counter unchanged and allows browser
  replacement.
- **Verify:** Unit test simulating `newContext` throw twice in a row; third acquire
  relaunches a browser. No drift in `activeContexts` after N failures.

## F-006 · QUEUED scan rows are never reclaimed — one Redis blip permanently stops a website's monitoring

- **Where:** Reaper `worker/src/scheduler.ts:186-201` (reaps only `RUNNING`); row-create
  before publish in `src/server/services/scan-service.ts:127-143` and
  `worker/src/scheduler.ts:140-157`. The comment claiming the reaper covers QUEUED rows
  is false. The in-flight checks (`scheduler.ts:94-97`, `scan-service.ts:79-87`) treat
  `QUEUED` as busy forever.
- **Fix:** Include `QUEUED` rows older than a short grace window (e.g. 5 min) in
  `recoverStuckScans` — requeue the job if the queue is reachable, else fail the row with
  a stable `errorCode`; correct the comments. Alternative (better long-term): create the
  row *inside* the job, or publish first into a BullMQ job that creates its own row.
- **Verify:** Integration test: create a QUEUED row, run the reaper with the queue up →
  job requeued; with the queue down → row FAILED with `errorCode`, website scannable
  again on the next trigger.

## F-007 · No overall scan deadline; `timeoutMs` accepted and never enforced; unbounded `page.evaluate`

- **Where:** `packages/scanner/src/scan.ts:228-316` never reads `input.timeoutMs`;
  `worker/src/jobs/free-scan.ts:45,122` passes `FREE_TIMEOUT_MS = 45_000` and it is
  silently dropped. Unbounded evaluates: `packages/scanner/src/consent/cmp-adapters.ts:156`,
  `phase-runner.ts:206,232,237`, `record/recorders.ts:279`,
  `instrumentation/dom-gating.ts:29,108`. No BullMQ job timeout / `lockDuration` tuning
  in `packages/scanner/src/queue/worker.ts` or `queues.ts`.
- **What:** A hostile page (`while(true){}` anti-bot) hangs an evaluate forever → the
  phase never returns → the pool permit and the BullMQ slot are held indefinitely. The
  reaper fails the *row* at 30 min but the job never completes, so the slot stays gone.
  Free traffic can wedge 1 of 2 default pool permits.
- **Fix:** Wrap each scan in a hard deadline (`AbortController` + `Promise.race` at the
  `runScan` level; reject and tear down the context on expiry); honor
  `input.timeoutMs`; add per-job `lockDuration`/stalled-interval settings; consider a
  `evaluate` wrapper with `Promise.race` timeout for the hot call sites.
- **Verify:** Fixture page with an infinite loop script → scan returns PARTIAL/FAILED
  within the deadline, pool permit released (assert context count back to zero — the
  repo's own forced-failure check).

## F-008 · SSRF gaps on Node-side fetches: redirects unchecked, `PinnedTarget` discarded

- **Where:**
  - `packages/scanner/src/spider/sitemap.ts:156-167` — validates entry URL, then
    `fetchFn` with default `redirect: "follow"`.
  - `worker/src/jobs/policy-audit.job.ts:63-89` (`fetchSafeHtml`) and `:119` (HEAD probe) — same shape.
  - `worker/src/jobs/webhook.job.ts:62-71` — validates `endpointUrl`, then follows redirects;
    this is a fetch to a **tenant-controlled** URL.
  - `assertSafeRedirect` + `PinnedTarget` (`packages/scanner/src/net/guard.ts:281-296`) are
    exported, unit-tested, and called from nowhere — the repo's twice-documented defect
    shape. `navigate()`'s `page.goto` also re-resolves DNS after the guard (TOCTOU;
    mitigated only by the egress firewall layer).
- **What:** A 302 to `http://169.254.169.254/…` (or any internal address) is followed
  unguarded; sitemap content flows back to the agency (read channel), webhook bodies
  leave the worker toward attacker-chosen targets after the initial check.
- **Fix:** One helper: `guardedFetch(url, { maxRedirects })` implementing
  `redirect: "manual"` + loop through `assertSafeRedirect`/`assertSafeUrl` per hop +
  response size cap; use it at all three call sites. Where feasible, connect to the
  pinned address (or accept and document the residual TOCTOU as infra-mitigated).
- **Verify:** Fixture server that 302s to a link-local address → fetch helper rejects
  with `SSRF_BLOCKED` at every hop depth; existing guard tests extended to the helper.

## F-009 · Rate limits keyed on client-controlled leftmost XFF; Turnstile fails open

- **Where:** `src/app/api/public/free-scan/route.ts:26-30`, `src/app/api/public/analytics/route.ts:44-52`,
  `src/app/api/public/contact/route.ts:15-19`, `src/app/api/portal/auth/request/route.ts:54-56`
  (all take `x-forwarded-for.split(",")[0]`); fail-open: `packages/shared/src/turnstile.ts:44-47`
  with only a log warn at `src/server/services/free-scan.ts:146-152`.
- **What:** Any proxy that appends leaves the attacker's value first — rotate the header
  and the per-IP budgets (free scan 3/h + 10/d, analytics 120/h, contact, portal
  magic-link 5/h) never bind. With `TURNSTILE_SECRET_KEY` unset in production, the
  challenge silently disables; combined with F-009's header spoofing, the free scanner's
  remaining control is the per-domain limit.
- **Fix:** Derive client IP from the rightmost trusted proxy hop (or the platform-provided
  IP header for the actual deployment, named per-deployment in one `getClientIp()`
  helper used by all four routes); add `TURNSTILE_SECRET_KEY` to the production env-drift
  check (`scripts/check-env.ts`) so it cannot be silently absent; log at error, not warn,
  when the challenge is disabled outside dev.
- **Verify:** Unit tests pinning `getClientIp()` behavior for append/prepend/no-XFF
  cases; env gate fails when the secret is missing with `NODE_ENV=production`.

## F-010 · PARTIAL current scans are drift-diffed against baselines → false drift events and alerts

- **Where:** `worker/src/analysis.ts:515-537` (fingerprint + `recordDrift` with no current-status
  check); `pickBaseline` guards only the baseline side (`packages/analysis/src/drift.ts:128`).
  Corroborated from the rules pass: `CMP_REMOVED` (`drift.ts:263-274`) → R018 CRITICAL;
  `SCORE_DROP` via the PARTIAL 75 ceiling (`score.ts:96,150-165` → `drift.ts:295-307`).
- **What:** One banner timeout in today's scan ⇒ every `@REJECT_ALL` key and post-consent
  domain looks "removed" vs the last COMPLETED baseline ⇒ phantom `PRIVACY_DRIFT`
  events ⇒ MEDIUM/CRITICAL alerts. Auto-resolve is correctly COMPLETED-gated; drift is not.
- **Fix:** Skip `recordDrift` (and score-drop events) when the current scan is not
  COMPLETED; store a `driftSkipped` marker so the UI can say "drift not evaluated — scan
  incomplete" (PARTIAL is first-class, including here).
- **Verify:** Fixture: COMPLETED baseline, then a PARTIAL scan missing the banner → zero
  drift events, dashboard shows the explicit skip note.

## F-011 · Credential-bearing tenant tables are registered GLOBAL

- **Where:** `AuthenticatedScanConfig` (AES-256-GCM login credentials) and
  `SitemapCrawlConfig`, `packages/database/prisma/schema.prisma:1888-1914`, listed in
  `GLOBAL_MODELS` (`packages/database/src/tenant.ts:110-111`); access path
  `src/server/actions/crawl-settings.ts:14,30,77,122,188`.
- **What:** No `agencyId`, so `forAgency()` cannot scope them at any layer; every access
  is guarded only by a prior `requireWebsiteAccess` check at each call site, and the
  file's `unsafeGlobalClient` justification is outside the sanctioned categories. Any
  future query resolving a `websiteId` without re-checking ownership reads or overwrites
  another tenant's authenticated-scan credentials.
- **Fix:** Add `agencyId` to both models (backfill from the website relation in a
  migration), remove them from `GLOBAL_MODELS`, drop the global client; the DMMF-driven
  tenancy test then enforces it forever.
- **Verify:** `tenancy.test.ts` fails if the models are global; a cross-tenant read
  attempt via scoped repos returns null.

## F-012 · "Delete" leaves all client evidence in object storage forever

- **Where:** Row cascade `packages/database/src/repositories/website.repository.ts:386`
  + schema cascades; the only object deletion is the retention sweep
  (`worker/src/jobs/cleanup.ts:246-264`), keyed on live DB rows. The comment at
  `src/server/actions/reports.ts:328-332` ("the S3 object is collected by the retention
  sweep") is false — `runRetention` (`cleanup.ts:78-103`) handles scans/screenshots/
  free-scans/portal sessions only; no report or agency sweep exists. Same gap for
  orphaned screenshot uploads (`worker/src/index.ts:315-316` comment also false).
- **What:** Hard-deleting a website/client/agency (or soft-deleting a report) leaves
  every PNG and PDF in the bucket with no row pointing at them — unrecoverable by any
  sweep. For a privacy product this is a data-minimization defect, not a storage bug.
- **Fix:** Delete objects before rows in `hardDelete` paths (report PDFs under
  `agencies/<id>/reports/`, screenshots under their tenant prefix); add an agency-deletion
  sweep (prefix delete `agencies/<agencyId>/`); remove or implement the two false comments.
- **Verify:** Integration test against a fake S3: hard-delete a website with N scans →
  N screenshot objects + all report PDFs gone; soft-delete a report → object gone.

## F-013 · Free-scanner public result page fabricates facts; conversion CTA drops the lead

- **Where:** `src/components/free-scanner/result-view.tsx:528-535` (renders the scanned
  site's own domain into the "Data is sent to" column and duplicates the tracker name
  into "Provider"; payload carries neither), `:206-224` + `:517-522` (category counts by
  regex on tracker names; `catNecessary = cmpDetected ? 1 : 0`; risk band falls back to
  `healthScore ?? 100` → a scan with no data renders "Low risk"), `:575,609`
  (`/signup?free_scan_token=` consumed by nothing — no reader exists in the repo).
- **What:** Fact-invention in UI on the public marketing surface (P1/P6 violation), plus
  a broken conversion loop: signups from a free scan lose the scan entirely.
- **Fix:** Render only what the payload carries (tracker names; drop the destination and
  provider columns or make the payload carry real data); compute categories/risk in the
  worker where the evidence is, and return them in `FreeScanSummary`; render "could not
  be determined" instead of a fabricated 100. Wire the CTA: accept `free_scan_token` on
  `/signup`, pass it through onboarding, and attach/link the scan after the agency is
  provisioned.
- **Verify:** Fixture scan with known trackers renders exactly the payload's fields; the
  signup→onboarding flow lands on a dashboard that references the originating scan.

## F-014 · Member website-scope is enforced on export but not on report download, scan progress, or search

- **Where:** Enforced: `src/app/api/v1/websites/export/route.ts:70`. Not enforced:
  `src/app/api/v1/reports/[id]/download/route.ts:59`, `src/app/api/v1/scans/[id]/progress/route.ts:41`,
  `src/app/api/v1/search/route.ts:32`.
- **What:** A member restricted to site A can download any READY report for site B in
  the same agency by id, watch B's scan progress, and search B's issues. Same-tenant
  only, but it contradicts the export route and defeats the per-member restriction.
- **Fix:** Apply `ctx.websiteScope` in the three routes (404, not 403, to match existing
  convention).
- **Verify:** Scoped-member test: report/progress/search for an out-of-scope site → 404.

## F-015 · Portal magic-link single-use is check-then-act; its limiter is still in-memory

- **Where:** `src/server/portal/session.ts:133-196` (findFirst → transaction that clears;
  two concurrent requests both win); `src/app/api/portal/auth/request/route.ts:39`
  (`memoryRateLimitStore()` — per-replica, deploy-resetting; every other limiter moved to Redis).
- **Fix:** Atomic single-use: conditional `updateMany({ where: { tokenHash, not consumed,
  not expired } })` and treat `count === 0` as replay (or `SELECT … FOR UPDATE` in the
  transaction); move the limiter to the shared Redis store.
- **Verify:** Test firing two consumes concurrently on one link → exactly one session.

---

# Tier 2 — Medium

## Rules engine honesty cluster (file a task per rule or one "rule truthfulness" task)

- **F-016** R034 rests on a 13-keyword hardcoded extractor with bidirectional substring
  matching (`packages/ai/src/prompts/policy-extract.ts:60-74`,
  `worker/src/jobs/policy-audit.job.ts:239-242`): a policy naming "Instagram" marks
  Google Analytics as disclosed; Criteo (not in the list) stays "undisclosed". Fix: wire
  the `POLICY_EXTRACT_V1` prompt/schema to the provider (it exists and is never sent), or
  mark extraction coverage explicitly and cap the finding's severity wording to what was
  actually checked.
- **F-017** R032 asserts a missing "Do Not Sell or Share" link no component ever looked
  for (`packages/analysis/src/rules/us-compliance.ts:68-100`); the only trigger is
  `cmpId === null`. Fix: measure the DOM for the link (a real fact) or make the finding
  conditional on measured absence.
- **F-018** R036 issues CRITICAL CIPA findings from vendor presence alone, including
  post-Accept detections, naming form pages the scanner never identified
  (`packages/analysis/src/rules/cipa-wiretap.ts:41-77`). Fix: require the form-page
  fact (see F-001) and gate on no-consent phases.
- **F-019** R050's trigger `errorCode === "BOT_CHALLENGE"` is produced by nothing
  (`packages/analysis/src/rules/advanced.ts:298-325`); its rationale invents geo-proxy
  infrastructure that does not exist. Fix: implement the detector or move to RESERVED.
- **F-020** R044 scans GTM requests across all phases but stamps
  `consentPhase: "NO_CONSENT"`, so `resolveEvidence` finds nothing and CRITICAL findings
  ship with empty evidence (`packages/analysis/src/rules/advanced.ts:159-201`,
  resolver at `worker/src/analysis.ts:139-161`). Fix: per-request phase attribution.
- **F-021** R040's EEA allowlist is missing ~17 members (Luxembourg, Norway, Iceland,
  Greece, Croatia, Slovenia, Hungary, Czechia, Slovakia, the Baltics, Bulgaria, Romania,
  Malta, Cyprus…) — `packages/analysis/src/rules/advanced.ts:372-375`. Fix: complete the
  list (incl. EEA-candidate handling), derive from a constant tested against a reference set.
- **F-022** R042 counts *any* ≥5 third-party requests (assets included) in
  `INTERACTIVE_ACTION` — a phase that accepts consent first — as "trackers without
  explicit consent" (`packages/analysis/src/rules/advanced.ts:123-156`). Fix: marketing-vendor
  filter + compare against the accept-phase baseline.
- **F-023** R009's "banner was found" exclusion is dead code — the `NO_CONSENT` phase
  never produces `CONSENT_NO_BANNER_FOUND` (`packages/analysis/src/rules/consent.ts:303-317`),
  so bespoke banners yield CRITICAL "No consent mechanism detected". Fix: emit the
  errorCode from the phase, or drop the dead guard and word the finding as the limitation it is.
- **F-024** Several CRITICALs bypass the corroboration gate: R031's `isCritical` is the
  filter itself (`us-compliance.ts:43-47`), R030 (`jurisdictions.ts:156`), R035
  (`policy-compliance.ts:136`). Fix: require ≥2 independent signals for CRITICAL, as R001 does.
- **F-025** `evaluateRules` swallows rule exceptions with no logging
  (`packages/analysis/src/rules.ts:151-163`) — this is *why* F-001/F-019 were invisible.
  Fix: `log.warn({ ruleId })` + a per-rule fire counter (metrics), and alert when a
  registered rule hasn't fired on any of the last N scans.
- **F-026** Issue-confidence join is keyed by `detection.vendorId` but looked up by
  `finding.subject` (a name/cookie/domain) — every issue persists at the 0.9 default
  (`worker/src/analysis.ts:392-394,412`). Fix: key the map by subject, or look up by vendorId.
- **F-027** AI cache omits model/tier from the hash (`packages/ai/src/cache.ts:53-65`) —
  a tier switch keeps serving standard-tier output for the TTL; cached rows are not
  re-validated on read (`run.ts:129-154`) despite the schema comment; the cookie AI
  classifier is never wired (`worker/src/jobs/cookie-classifier.job.ts:96`) and the
  heuristic fallback writes "Unknown Provider" strings into `trackerVendorId`
  (`packages/ai/src/cookie-classifier.ts:159-171`). Fix: include model+tier in the hash,
  validate on read (or version the cache key), wire `classifyFn` or delete the dead path.

## Scan pipeline reliability

- **F-028** Screenshots are never captured on any scan: default
  `{ policy: "ON_CHANGE", changed: undefined }` → `shouldCapture` false every time
  (`packages/scanner/src/phase-runner.ts:140-143`, `scan.ts:242-254`,
  `record/screenshots.ts:34-38`). The human-corroboration layer is silently dead. Fix:
  pass an explicit policy from scan configs (default capture pre-consent banner), or
  remove the feature flag surface until real.
- **F-029** `respectRobots` is plumbed, advertised (free-scan comment claims parity with
  paid scans), and never implemented — robots.txt is fetched nowhere; `sitemapConfig`,
  `monitoredPaths`, `authConfig` are carried but `runScan` visits only the entry URL;
  `pagesScanned` counts configured-but-unvisited sitemap URLs
  (`worker/src/jobs/free-scan.ts:117-119`, `packages/scanner/src/scan.ts:307-309`). Fix:
  implement robots fetching/evaluation before multi-page work lands, or strip the
  config surface and its claims.
- **F-030** Retry classification: every HTTP ≥400 collapses to `HTTP_CLIENT_ERROR`
  (permanent) and `HTTP_SERVER_ERROR` (transient) is never produced — a 503 blip is
  never retried and graduates to `WEBSITE_UNREACHABLE` alerts; conversely DNS NXDOMAIN
  goes down the retryable path 3× (`packages/scanner/src/navigate.ts:177`,
  `scan.ts:78`, `types.ts:131-137`). Fix: classify 408/425/429/5xx (and network resets)
  as transient; `DNS_NXDOMAIN` as permanent.
- **F-031** The 30-min reaper can force-FAIL a live slow scan, and `complete()` then
  resurrects the row with no status guard
  (`worker/src/scheduler.ts:186-201`, `packages/database/src/repositories/scan.repository.ts:156-196`).
  Fix: compare-and-set status transitions (complete()/fail() only from RUNNING).
- **F-032** After the final retryable attempt the row sits RUNNING ~30 min before the
  reaper marks it FAILED — dashboard shows "running", new scans suppressed
  (`worker/src/index.ts:145-153,480-487`). Fix: fail the row in the `failed` handler on
  terminal exhaustion.
- **F-033** Webhook deliveries: permanent endpoint rejections (400/401/403/410) retried
  all 5 attempts; only SSRF blocks short-circuit (`worker/src/jobs/webhook.job.ts:100,144-189`).
  The email fix's exact shape, reintroduced. Fix: `PERMANENT_STATUSES` set like the email transport.
- **F-034** Worker-consumed barrels still use `export *`
  (`packages/analysis/src/index.ts:29`, `packages/analysis/src/remediation/index.ts:1-2`,
  `packages/database/src/index.ts:14`) — the documented boot-death shape under tsx/ESM.
  Fix: explicit re-exports, matching the other packages' "NOT `export *`" barrels.
- **F-035** Free scans stuck RUNNING are never reaped (`recoverStuckScans` covers
  `db.scan` only), and the default 2/1 pool split contradicts the adjacent "free is a
  small fraction" rule with no boot-time ratio check (`worker/src/index.ts:475-507`,
  `worker/src/jobs/cleanup.ts:282-285`). Fix: reap `FreeScan` rows; enforce or configure
  the ratio.

## API surface

- **F-036** Rate-limit breaches answer 500 instead of 429 on six v1 routes — the
  limiter throws `ApiRateLimitError`, mapped only inside `withApiErrors`, which these
  handlers don't use (`src/server/services/api-rate-limit.ts:75,92`,
  `src/app/api/v1/_lib/with-errors.ts:33`; unwrapped: websites GET/POST, websites [id]
  GET/DELETE, scans [id] GET, websites [id]/scans POST, issues GET, reports GET, and
  reports/[id]/download via a `toAppError` that doesn't know the type). Fix: wrap all
  v1 handlers in `withApiErrors` (or teach `toAppError` the class).
- **F-037** Non-numeric `limit`/`offset` → `NaN` → Prisma throw → 500 on three list
  endpoints (`src/app/api/v1/websites/route.ts:35-36`, `issues:44-45`, `reports:48-49`).
  Fix: Zod-parse pagination; 422 on bad input.
- **F-038** `POST /api/v1/websites` validates by hand: `scanPriority as never` (any
  string reaches Prisma → 500), `monitoredPaths` unbounded (count/length),
  `frequency as never` safe only via an untested coupling
  (`src/app/api/v1/websites/route.ts:123-187`). Fix: Zod schema like the sibling routes.
- **F-039** `/api/health/ready` (public) echoes raw dependency error messages —
  Prisma/Redis/S3 failures expose internal hosts/URLs
  (`src/app/api/health/ready/route.ts:29-35`, `src/server/admin/health.ts:65`). Fix:
  return the dependency *name* and a stable code; keep detail in logs.
- **F-040** `POST /api/public/free-scan/[token]/email` is unthrottled and writes data
  nothing consumes — the UI's "receive your report" promise is unfulfilled server-side
  (`src/app/api/public/free-scan/[token]/email/route.ts:43-54`,
  `src/components/free-scanner/result-view.tsx:167`). Fix: rate-limit + either deliver
  the report or remove the endpoint.
- **F-041** Scan trigger via API v1 works on archived/paused websites and burns quota
  (`src/server/services/scan-service.ts:66-71`). Fix: reject with a stable code.
- **F-042** Screenshot evidence export is uncapped (the other four kinds cap at 5000)
  (`src/app/api/v1/websites/[id]/evidence/export/route.ts:132-133`). Fix: cap it.
- **F-043** Report download audit-logged as `report.generated`, polluting generation
  audit trails (`src/app/api/v1/reports/[id]/download/route.ts:86`). Fix: distinct
  `report.downloaded` action.
- **F-044** Expensive session routes have no per-user rate limit: `/api/v1/ai/generate`
  (provider cost; only the monthly credit cap bounds it), `/api/v1/websites/validate`
  (DNS-resolving SSRF check), `/api/v1/settings/audit/export` (50k-row stream). Fix:
  modest per-user limits via the existing Redis limiter.

## Billing

- **F-045** Checkout race: two concurrent `ensureCustomer` calls create two Stripe
  customers; the second `checkout.session.completed` then hits the `agencyId @unique`
  and returns 500 → Stripe retries the failing event indefinitely; user can be charged
  twice (`src/server/services/billing.ts:50-72`,
  `src/server/services/billing-webhook.ts:209-229`). Fix: lock per-agency (advisory lock
  or unique-constraint-tolerant upsert), and make the webhook path idempotent on
  `client_reference_id`.
- **F-046** `INCOMPLETE` is missing from `READ_ONLY_STATUSES` — payment-pending
  subscriptions resolve full entitlements
  (`packages/billing/src/entitlements.ts:95-101`). Fix: add it.
- **F-047** Webhook idempotency comment doesn't match behavior: concurrent duplicates
  both apply; `track("subscription_upgraded")` double-fires
  (`src/server/services/billing-webhook.ts:31-62,138-166`). Fix: claim-then-apply on the
  event row (status CAS), so analytics fire once.
- **F-048** `extendTrialAction` writes `TRIALING` unconditionally — regains metered
  usage on a canceled/unpaid subscription for up to 24 h until reconcile
  (`src/server/admin/actions.ts:367-403`). Fix: only extend rows Stripe still considers active.
- **F-049** Stripe-Tax fallback keys off an error-message substring (`message.includes("tax")`)
  (`src/server/services/billing.ts:156-167`). Fix: match documented error codes.
- **F-050** `saveBranding` lets an unentitled agency persist white-label config (inert
  today, latent tomorrow) (`src/server/actions/branding.ts:38`). Fix: `requireFeature(…, "whiteLabel")`.
- **F-051** `replayWebhookAction` is the only destructive admin action without a
  required reason (`src/server/admin/actions.ts:468-489`). Fix: `reason.min(8)` like its siblings.

## Email / reports / notifications

- **F-052** A crashed render leaves reports stuck GENERATING forever: the retry path
  returns FAILED without `markFailed`, `requeue` refuses GENERATING, and no reaper
  exists (`worker/src/jobs/report.job.ts:74-79,147-168`,
  `packages/database/src/repositories/report.repository.ts:146-152`). Fix: GENERATING
  reaper (age-based → FAILED) + allow requeue from GENERATING.
- **F-053** Email job payloads are never runtime-validated (`data.message as EmailMessage`);
  a malformed job throws in the template switch and retries all 8 attempts over ~2 h as
  a poison pill; no DLQ (`worker/src/jobs/email.job.ts:74`, `queues.ts:270,317-322`).
  Fix: Zod-validate at the job boundary; fail fast (no-retry) on schema mismatch.
- **F-054** Slack dispatch ignores rule matching, severity, and quiet hours — fires for
  suppressed INFO events — while rule-based Slack routing is dead code (schema can't
  express the "slack" channel) (`worker/src/jobs/notification.job.ts:257-278`,
  `packages/schemas/src/notification.ts:34`). Fix: route Slack through `planDispatch`
  and add "slack" to the channel enum (or remove the feature from the plan page).
- **F-055** `List-Unsubscribe`/one-click headers are dead code — no caller passes
  `listUnsubscribeUrl`, so digests ship without RFC 8058 one-click unsubscribe (Gmail/Yahoo
  bulk-sender requirement) (`packages/email/src/client.ts:170-177`,
  `worker/src/jobs/email.job.ts:87-91`). Fix: pass the URL for the two unsubscribable templates.
- **F-056** Digest rows are recorded as `type: "PRIVACY_DRIFT"` — the exact lie
  `email.job.ts:180-186` documents having removed — polluting alert History and the
  duplicate-window query (`worker/src/jobs/digest.job.ts:204-213`). Fix: a `DIGEST` type.
- **F-057** Digest average includes PARTIAL-confidence scores; the report layer
  deliberately excludes them — same portfolio, two answers
  (`worker/src/jobs/digest.job.ts:273-282` vs `packages/reports/src/report-data.ts:385-391`).
  Fix: exclude `scoreConfidence: "PARTIAL"` in the digest.
- **F-058** Concurrent PDF renders can leak a whole Chromium: module-singleton launch has
  an await between check and assign, report concurrency is 2
  (`packages/reports/src/pdf.ts:36-62`). Fix: promise-memoize the launch.
- **F-059** `storage.get()` buffers the entire object before the caller's size check
  applies (`packages/storage/src/index.ts:93-105` vs `report-data.ts:637`). Fix:
  ranged/streamed fetch with the cap applied first.

## Database / tenant layer

- **F-060** `upsertFromScan`: unbounded per-finding loop in an interactive transaction
  with no timeout (Prisma default 5 s) + find-then-create race on
  `(websiteId, fingerprint)`; the P2002 loser fails the whole analysis
  (`packages/database/src/repositories/issue.repository.ts:155-269`). Fix: explicit
  `{ timeout }`, catch P2002 → retry as update.
- **F-061** Analysis replay inflates `Issue.occurrenceCount` and re-stamps `lastSeenAt`
  (evidence dedupe makes replay *look* safe) (`issue.repository.ts:238-258`). Fix:
  occurrence increments keyed by (issueId, scanId) novelty.
- **F-062** Retention covers scans/evidence/free-scans/portal sessions only;
  `webhook_deliveries` (full payloads), `alert_history` (recipients), `ai_requests`,
  `audit_logs` (ipHash + userAgent), `system_logs` grow unbounded
  (`worker/src/jobs/cleanup.ts:78-103`). For a privacy product, unbounded IP-hash/UA
  retention is the practice the product flags in others. Fix: retention horizons + sweep
  entries for all five.
- **F-063** Missing `(scanId, timestampMs)` index on the hottest UI query (evidence
  browser default sort sorts thousands of rows before LIMIT); same shape for
  `StorageEntry` ordering by key (`packages/database/src/repositories/scan.repository.ts:375-385,411-422`,
  `schema.prisma:601-604`). Fix: add the composite indexes (tracked migration).
- **F-064** ~11 scope columns lack declared FKs (`Notification.agencyId`,
  `PortalSession.agencyId/clientId`, `WebsiteJurisdictionConfig.agencyId`,
  `PolicyAudit.agencyId`, `SessionReplayAudit.agencyId`, `GpcAuditRecord.agencyId`,
  `CnameResolution.agencyId`, `IgnoreRule.createdById`, `IssueFeedback.userId`,
  `Issue.driftEventId`, `FreeScan.convertedAgencyId`) — orphaned rows on agency delete.
  Fix: add FKs + cascade policy in one additive migration.
- **F-065** The tenant-enforcement lint rule doesn't cover the directories that actually
  hold raw-prisma imports (`src/server/auth|portal|admin|queries`), and
  `unsafeGlobalClient(reason)` drops the reason on the floor — no log, no metric
  (`eslint.config.mjs:89-108`, `packages/database/src/tenant.ts:271-278`). Fix: widen the
  lint globs; log the reason once at call time.
- **F-066** Duplicate indexes on unique columns (ReportShare.token, ApiKey.keyHash,
  PortalSession.tokenHash, FreeScan.token, User.clerkUserId, User.email) — pure write
  overhead, faithfully migrated. Fix: drop the redundant indexes (additive-safe, contract
  migration).
- **F-067** String-typed enums where Prisma enums exist for siblings
  (`IssueActivity.type/actorType`, `AlertHistory.channel/status`,
  `IssueFeedback.verdict`, `AlertRule.scopeType`, `NetworkRequest.resourceType`,
  `StorageEntry.storageType`, `Screenshot.kind`, `SystemLog.level`). Fix: convert on a
  quiet wave (expand/contract), or at least Zod-validate at the boundaries.
- **F-068** Worker shutdown never calls `prisma.$disconnect` (`worker/src/index.ts:661-692`);
  portal magic-link issuance seq-scans `portal_users` by email (only the composite
  unique index exists; pre-auth traffic drives it)
  (`src/server/portal/session.ts:99-103`, `schema.prisma:1311`). Fix both (one-line each + index).

## Tests / CI

- **F-069** Coverage thresholds (85%) cannot pass and are never run — `verify` and CI
  run bare `npm test`; the on-disk coverage report predates the deletion
  (`vitest.config.ts:98-123`, `package.json:21`, `.github/workflows/pr.yml:93-94`). Fix:
  either wire `test:coverage` into CI with realistic initial thresholds, or delete the
  thresholds until coverage is real. A gate that has never been run is worse than none.
- **F-070** Zero-coverage areas where this repo's documented defects actually lived:
  SSRF guard (`assertSafeRedirect`, `guardedFetch` once F-008 lands), email transport
  (From header, `EmailRejectedError`), white-label entitlement, all worker jobs (webhook
  HMAC delivery, scan-quota, digest), all of `packages/billing`, `src/server/**`, all
  `src/app/api/v1` handlers. Restore in that order — the fix waves below create the
  tests as they go.
- **F-071** `deploy.yml`: validate job omits tests and doesn't `needs:` the PR workflow
  (a deploy can ship while tests are red); "Smoke test & Healthcheck" only echoes two
  lines — the `/api/health/ready` curl is commented out
  (`.github/workflows/deploy.yml:37-43,214-219`). Fix: run the suite in validate (or gate
  deploy on the PR run), implement the healthcheck step for real.
- **F-072** AGENTS.md cites deleted test files as if present (defect #8's
  `ssrf-navigation.test.ts` path is dead); the "0 unit tests" measurement and rule
  counts need re-measuring after the fix waves. Fix: update AGENTS.md when F-070 lands.
- **F-073** e2e brittleness: exact price assertions (`$49/$149/$349/$799/£39`),
  `localtest.me` requiring live DNS, committed default Clerk test credentials
  (`e2e/public.spec.ts:18-25,41`, `e2e/auth.setup.ts:22-23`). Fix: move prices to copy
  constants, gate that spec on DNS or use a fixture domain, keep creds env-overridable
  (they are) and consider gitleaks allowlisting.

## Frontend / UI

- **F-074** Dashboard averages include PARTIAL-confidence scores while the portal
  excludes them — the two surfaces disagree about the same portfolio
  (`src/server/queries/dashboard.ts:109-113`, `src/app/(app)/app/clients/[clientId]/page.tsx:51-56`
  vs `src/server/portal/serializers.ts:264-272`). Fix: exclude PARTIAL everywhere (or
  annotate inclusion explicitly, consistently).
- **F-075** Locale-less date formatting: `toLocaleString()` with no locale/timezone in a
  SSR-able client component (hydration-mismatch class), bare `toLocaleDateString()`
  next to a correct helper in the same file, `en-US` month format against the app's
  `en-GB` standard, raw UTC ISO in the evidence scan-picker
  (`src/app/(app)/app/websites/[websiteId]/crawl/crawl-settings-view.tsx:229`,
  `src/app/(app)/app/settings/api/api-settings-view.tsx:295,298`,
  `src/components/free-scanner/result-view.tsx:200-204`,
  `src/app/(app)/app/websites/[websiteId]/evidence/page.tsx:210`). Fix: route all through
  `src/lib/format.ts` with the agency timezone.
- **F-076** `MutedBadge` bare-number counts ignore the component's own "label is not
  optional" contract — screen readers hear "1" with no referent
  (`src/app/(app)/app/page.tsx:68`, `src/components/websites/website-grid.tsx:89-92`).
- **F-077** String literals in JSX bypassing `t()` (the 1,677-call convention): both
  `not-found.tsx` pages, API-settings toasts, free-scanner copy, marketing card
  headings, admin labels. No banned terminology involved. Fix opportunistically.
- **F-078** Public bearer-token surfaces (`/reports/shared/[token]`, `/invite/[token]`,
  `(onboarding)`) have no `loading.tsx`/`error.tsx` — a thrown error on a client-facing
  shared report falls to bare `global-error` with no branded chrome or retry
  (`src/app/reports/shared/[token]/`, `src/app/invite/[token]/`). Fix: add the two files
  to each group.
- **F-079** `/guides(.*)` is in `PUBLIC_ROUTE_PATTERNS` and cited by blog content, but
  no page exists (`src/lib/public-routes.ts:24,78`). Fix: remove the entry or build the page.
- **F-080** Health-score band conveyed by dot colour only in table contexts
  (`src/components/ui/health-score.tsx:47-54`, call sites `app/page.tsx:75`,
  `websites/page.tsx:105`). Not a hard WCAG breach (the number is present) but the
  75/50/25 thresholds are invisible. Fix: `showBand` in dense tables or a `title`.
- **F-081** `/invite` builds `/login?redirect_url=` relying on Clerk's implicit legacy
  param handling — no `forceRedirectUrl` is passed
  (`src/app/invite/[token]/page.tsx:126,135`). Fix: pass it explicitly to `<SignIn>`.

---

# Tier 3 — Low (grouped; fix opportunistically)

- **Security hardening:** team invite tokens stored plaintext while portal/report
  tokens are hashed (`src/server/actions/team.ts:233-241`); `hashIp` falls back to an
  empty salt and `FREE_SCAN_IP_SALT` is missing from `.env.example`
  (`src/server/services/free-scan.ts:93-96`); Resend webhook has no event-id dedup
  within the 5-min window (writes are idempotent, impact negligible)
  (`src/app/api/webhooks/resend/route.ts:36-58`); `login-runner.ts` navigates with no
  route guard and is currently dead code — the first caller must wire the guard
  (`packages/scanner/src/auth/login-runner.ts:49-83`); subresource requests from
  scanned pages are deliberately unguarded (internal-network oracle; acceptable only
  while the egress firewall holds — document the dependency)
  (`packages/scanner/src/navigate.ts:64-69`); AI generate/feedback session routes lack
  per-request limits (see F-044).
- **Data/consistency:** `Issue` double-reporting between R039 and X02 on the same
  storage entry; R021/R027 same for long cookies (precedence can't collapse them);
  `FreeScan.email` writes nothing consumes (see F-040).
- **Worker ops:** scheduler comment defects ("scanned one cycle late" is actually
  skipped-a-cycle) (`worker/src/scheduler.ts:60-65`); `withApiRateLimit` exported+tested,
  called from nowhere (`api-rate-limit.ts:115`); free/paid pool ratio unchecked (F-035).
- **Docs:** AGENTS.md stale test citations (F-072); `NEW-PLAN.md` deletion is staged in
  the working tree (decide: commit or restore).
- **Plugins:** GitHub Action emits `PASSED`/`FAILED` verdicts — build-gate semantics,
  not compliance claims, but worth a glance from whoever owns the terminology gate
  (`plugins/github-action/audit.js:177,186`).

---

# Cross-cutting improvement program

These are not defects; they are the standing capabilities that would have caught the
above and will catch the next round.

1. **Rule observability (unlocks F-001/F-019 forever).** Per-rule fire counter +
   last-fired timestamp metric; a weekly assertion that every `RULES` entry fired on
   real traffic within N days, or is on the dormant list with a reason. "Registered"
   should mean "observed."
2. **Test strategy (fills F-070).** Priority order matches where the repo's real
   defects lived: (a) SSRF/guard tests restored with the new `guardedFetch`; (b) email
   transport contract tests; (c) entitlement resolver tests incl. `requireFeature`
   call-site inventory; (d) worker job tests (webhook HMAC, scan-quota, digest);
   (e) `upsertFromScan` transaction/race tests; (f) API v1 handler tests (429/422
   classes). Component tests are the lowest priority.
3. **Env drift expansion.** Add to `scripts/check-env.ts`: `TURNSTILE_SECRET_KEY`
   (production), `FREE_SCAN_IP_SALT`, `GEOIP_*` when F-003 lands, and a
   fail-hard-on-production-unset policy for anything the free scanner's controls
   depend on.
4. **Deletion is a workflow, not a cascade (generalizes F-012).** One
   `deleteAgencyAssets` service that all delete paths (website, client, report, agency)
   must route object removal through, with a test asserting bucket emptiness.
5. **A "comments that promise behavior" sweep.** Four of this review's findings were
   false comments claiming an enforcement exists (QUEUED reaper, report PDF sweep,
   orphaned screenshots, webhook idempotency). Consider a lint-of-comments is overkill —
   but add each corrected comment's claim as a test name, so the claim is executed
   rather than asserted.

---

# Fix waves (recommended order)

**Wave 1 — Truth in findings (Critical).** F-001, F-003, F-004. These change what the
product tells customers. Ship before any new-feature work; each lands with its rule
tests and, for F-004, an entitlement call-site inventory test.

**Wave 2 — Worker survival.** F-005, F-006, F-007, F-031, F-032. The pool leak + no
deadline + unreaped QUEUED rows compound: any one wedges scans; together they explain
"worker dies within hours." All are small, testable diffs. Include the forced-failure
context-count check (repo rule) in every PR's verification.

**Wave 3 — Anonymous-surface security.** F-008, F-009, F-040. SSRF per-hop on all Node
fetches (incl. webhooks), real client-IP derivation, Turnstile env gate.

**Wave 4 — Tenant isolation + paid-feature enforcement.** F-002, F-011, F-014,
F-046, F-050. Mostly wiring through existing machinery (`forAgency`, `requireFeature`).

**Wave 5 — Honesty in drift and deletion.** F-010, F-012, F-056, F-057, F-074. PARTIAL
discipline end-to-end; storage deletion that actually deletes.

**Wave 6 — API and billing robustness.** F-030, F-033, F-036–F-039, F-045, F-048,
F-052, F-053. Status-code correctness, retry classification, poison pills, the Stripe
race.

**Wave 7 — Data hygiene.** F-060–F-068 (one additive migration batch where schema
changes are involved), F-062 retention expansion.

**Wave 8 — Test and CI restoration.** F-069–F-073, plus the priority suites from the
improvement program. Run `npm run verify` (with the DLL lock cleared) and wire coverage
in only when thresholds are honestly set.

**Ongoing:** Tier 3 opportunistically; frontend polish (F-075–F-081) as touch-and-fix.

---

# Verification appendix

- **Gates:** stop `next dev` and the worker first (Prisma DLL EPERM), then
  `npm run db:generate && npm run verify` (lint, typecheck, terminology, env drift,
  tests, build). DB-backed suites need `docker compose up -d`.
- **Scanner changes:** assert context count returns to zero on a forced-failure scan.
- **Schema changes:** generate and inspect the migration; never `db push`.
- **Security surfaces** (SSRF guard, tenant scoping, free scanner, portal auth, evidence
  redaction): run `/security-review` on every change, per CLAUDE.md.
- **Each task:** acceptance evidence written into its `dev-doc/tasks/` file, or the
  status is `BUILT`, not `DONE`.
- **Reporting discipline:** a partially-fixed cluster is reported as partial — the same
  standard the product applies to scans.
