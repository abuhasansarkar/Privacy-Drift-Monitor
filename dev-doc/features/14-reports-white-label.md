# Feature 14 — Reports & White-Label

> **Phase:** 4 · **Priority:** P0 · **Effort:** XL + M + M · **Value:** 5
> **Status:** ✅ Built and verified — all five types render real PDFs, and the concurrent two-agency branding test passes
> **Plan refs:** Part VI §6.9 (branding), Part III §3.11 (`/app/reports`), Part XI (report design)

## What it is

Five report types rendered from React templates to PDF via Playwright, stored in S3, generated
asynchronously, and branded with the agency's logo and colours.

## Why it exists

**The billable artifact.** JTBD J7: *"Give me something branded to send monthly."* And J8:
*"Let me sell this as a service line."* Part XI §11.10 names the retention predictor: **first
white-label report generated within 14 days.** This feature is why agencies renew.

## Dependencies

Features 09, 10, 11 (content), 01 (tenancy). Blocks: 15 (portal report downloads).

## Report types

Scan · Issue · Monthly Monitoring · Website Health · Privacy Drift. Scope: agency, client or
website.

## Build steps

### Branding first
- [ ] Branding settings page: logo (light + dark), primary/accent colours **with contrast
      validation at save time**, company name, report footer text, custom disclaimer, contact
      email, portal subdomain
- [ ] Live preview of a report cover and a portal header
- [ ] **Entitlement-gated on `whiteLabel`**
- [ ] Branding resolver — an explicit `agencyId`-scoped query
- [ ] **Branding snapshotting** onto the report at generation time, so a later branding change
      doesn't retroactively alter an already-delivered report

### Reports
- [ ] React templates in `packages/reports`, copy separated into `packages/reports/src/copy/`
- [ ] Playwright PDF renderer
- [ ] Async generation job with live progress + email/in-app completion notification
- [ ] S3 storage under the **tenant prefix**; served by signed URL
- [ ] `/app/reports` library: name, type, scope, period, generated, by, status
      (Queued/Generating/Ready/Failed), size, actions
- [ ] `/app/reports/new` wizard: type → scope → period → options (evidence appendix, AI
      summary, resolved issues, screenshots) → branding preview → Generate
- [ ] `/app/reports/[id]`: metadata, inline PDF preview via `<iframe>` on a signed URL,
      download, regenerate, **share link (time-limited, signed, audit-logged)**
- [ ] The disclaimer is embedded in **every** PDF

## The cross-tenant leakage rule

> **A shared branding cache keyed by anything other than `agencyId` is how Agency A's logo
> ends up on Agency B's report.**

This must be proven, not reasoned about: *"two agencies' reports rendered concurrently do not
cross-contaminate branding"* is a Phase 4 acceptance criterion and needs a concurrent-render
integration test.

## Acceptance criteria

- [ ] All five report types generate
- [ ] PDFs carry agency branding
- [ ] Generation is asynchronous with progress and a completion notification
- [ ] **Concurrent multi-tenant generation does not leak branding** (asserted)
- [ ] Reports are stored under the tenant prefix and served by signed URL
- [ ] **A failed report does not consume the allowance** — and the error copy says so
- [ ] Share links expire and are audit-logged
- [ ] Brand colours failing contrast are rejected at save time
- [ ] Every PDF contains the disclaimer
- [ ] p50 generation < 30 s, p95 < 120 s

## Tests required

| Level | What |
|---|---|
| Integration | **Concurrent two-agency render, asserting no branding bleed** |
| Integration | Failed generation does not decrement the allowance |
| Integration | Signed URL is tenant-asserted |
| E2E | Report generation → download |
| Manual | Open PDFs in Preview, Acrobat and Chrome before launch |

## Failure modes

| Mode | Handling |
|---|---|
| S3 outage | Generation retried; allowance untouched |
| Renderer timeout on a huge evidence appendix | Cap appendix size; degrade to summary + note |
| Branding logo missing/oversized | Validate on upload; fall back to the agency name as a wordmark |

## Traps

- Report PDFs must render **identically regardless of the requesting device** (Part XI §11.5).
- Print-appropriate design: white background, restrained accent, wide margins. The dashboard's
  visual language does not transfer directly — see `UI_DESIGN_PROMPTS.md` §9.2.
- Snapshot the branding. Without it, regenerating last quarter's report produces a document
  that doesn't match the one the client already has.
