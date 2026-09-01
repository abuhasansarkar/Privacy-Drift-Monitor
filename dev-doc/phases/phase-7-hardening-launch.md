# Phase 7 — Hardening & Launch

> **Goal:** production-ready.
> **Dependencies:** Phase 6 · **Status:** 🟡 Substantially built & verified; operational launch steps documented
> **Plan ref:** Part XII §12.3 (Phase 7), §12.5 (readiness), §12.6 (launch), Part X (all)

No new features. This phase is entirely about proving the thing works under adversarial
conditions and can be operated by a human at 3 a.m.

## Tasks

| # | Task | Effort | Status | Note |
|---|---|---|---|---|
| 7.1 | Security review: SSRF vectors, tenant escape, authz bypass, dependency audit, CSP | M | ✅ | Full review in `dev-doc/ops/security-review.md`. CSP, security headers, SSRF navigation guards verified |
| 7.2 | Load testing (k6) and tuning to the performance budgets | M | 🟡 | k6 scripts in `load/` (`marketing.js`, `api-reads.js`, `free-scanner.js`). Local benchmarks verified; prod load test needs infra |
| 7.3 | Full observability: dashboards, alert routing, runbooks | M | ✅ | Sentry client/server/edge configs (`src/lib/sentry.ts`), 5 runbooks in `dev-doc/ops/runbooks.md`, alert thresholds specified |
| 7.4 | Backups configured; **restore drill executed and documented** | S | ✅ | `scripts/backup.sh` & `scripts/restore-drill.sh` executed and verified; documented in `dev-doc/ops/backup-and-restore.md` |
| 7.5 | DR runbook written and walked through | S | ✅ | `dev-doc/ops/disaster-recovery.md` with walkthrough logs for worker kill & database restore |
| 7.6 | Accessibility audit (axe + manual keyboard + screen reader) and fixes | M | 🟡 | axe-core WCAG 2.2 AA in `e2e/accessibility.spec.ts`, token contrast fixed in `globals.css`; manual screen-reader pass pending |
| 7.7 | Full E2E suite green | M | ✅ | 4 Playwright specs in `e2e/` covering public, authenticated app, accessibility, security headers |
| 7.8 | Production infrastructure, deploy pipeline, smoke tests | M | ✅ | `Dockerfile.web`, `Dockerfile.worker`, `.github/workflows/deploy.yml` with health-gated rollout |
| 7.9 | Legal pages finalized with counsel review | S | 🟡 | Drafted at `content/legal/index.ts` and rendered at `/legal/[doc]`; external legal counsel review pending |
| 7.10 | Help content, onboarding emails, changelog | M | ✅ | `/app/help` + `content/help/`, 19 email templates, `/changelog` + `/app/changelog` + `content/changelog/` |
| 7.11 | Launch checklist execution | S | 🟡 | Checklist compiled in `dev-doc/ops/launch-checklist.md`; go-live execution pending production cluster |


## Performance budgets to hit (7.2)

From Part X §10.12. These are gates, not aspirations.

| Surface | Target |
|---|---|
| Marketing LCP | < 2.0 s |
| App dashboard TTI | < 2.5 s warm |
| App list pages TTFB | p95 < 400 ms |
| API reads | p95 < 300 ms, p99 < 800 ms |
| API writes | p95 < 500 ms |
| DB queries | p95 < 100 ms, p99 < 300 ms |
| Evidence viewer, 5,000 rows | < 100 ms per interaction |
| Scan (4 phases, 1 page) | p50 < 150 s, p95 < 400 s |
| Report generation | p50 < 30 s, p95 < 120 s |
| AI call | p95 < 8 s |

Load scenarios: 100 concurrent scans · dashboard under 50 concurrent users · evidence viewer
with 5,000 rows.

## Accessibility (7.6)

WCAG 2.2 AA. Manual keyboard-only pass plus screen-reader testing (VoiceOver + NVDA) on:
dashboard, issue list, issue detail, add-website flow, and the portal. `axe-core` assertions
in E2E for the ten highest-traffic pages.

Non-negotiables: severity is never colour alone · 2 px visible focus ring never removed ·
dialogs trap and restore focus · route changes move focus to the `h1` · usable at 200% zoom
and 320 px width without horizontal scroll · target size ≥ 24×24 px, ≥ 44×44 px on touch.

## Production readiness checklist

The full checklist is Part XII §12.5. It is long and it is the actual bar — work through it
there, not from memory. Section headings: **Product · Security · Scanner · Database ·
Billing · AI · Infrastructure**.

The items most often skipped, called out here so they aren't:

- [ ] Browser workers stable over a **24-hour soak** with no memory growth
- [ ] Stuck-scan recovery verified **by killing a worker mid-scan**
- [ ] Consent adapter success rate > 90% per supported CMP on fixtures
- [ ] **Restore drill completed and documented** — a backup that has never been restored is
      not a backup
- [ ] Graceful shutdown verified — no jobs lost on deploy
- [ ] Webhook idempotency verified **with replayed events**
- [ ] Tenant isolation tested across every model **including nested relations**
- [ ] Counter reconciliation job running and finding zero drift
- [ ] Migrations run as a discrete pre-deploy step with a destructive-change guard
- [ ] CI terminology check passing

## Launch checklist

Full list in Part XII §12.6, four groups: **Technical · Product · QA · Go-live.**

Highest-consequence items:

- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` pinned and **identical across all web containers**
- [ ] Tracker database seeded (an unseeded vendor DB means every third party reads "unknown")
- [ ] Plans seeded and matched to live Stripe products/prices in all three currencies
- [ ] Workers deployed with the correct `WORKER_ROLES`
- [ ] Resend domain verified with SPF/DKIM/DMARC
- [ ] `/bot` page live, explaining who we are and how to allowlist or exclude us
- [ ] Terms, Privacy, Cookie Policy and Disclaimer published and linked from **the app,
      reports and portal**
- [ ] Free scanner tested against 20 real websites
- [ ] AI outputs reviewed for tone and accuracy on 20 real issues
- [ ] Emails rendered in Gmail, Outlook and Apple Mail; PDFs opened in Preview, Acrobat, Chrome
- [ ] A beta cohort of 5–10 agencies onboarded and interviewed
- [ ] Rollback procedure tested

## Two things to resolve before launch, not after

1. **Legal review of the scanning posture.** Part XII §12.8 assumption 11 and §12.9 question 1
   are explicitly flagged: we scan without per-domain ownership verification, relying on
   Terms-based responsibility, an identifiable scanner, robots respect and honored opt-out.
   This is the single most consequential open question and it goes to counsel.
2. **Legal review of all customer-facing copy** for the compliance-positioning risk — the
   terminology enforcement exists precisely so this review is cheap.
