# Launch Checklist & Production Readiness

> **Plan ref:** Part XII §12.5 (readiness), §12.6 (launch checklist), §12.3 (Phase 7 task 7.11)
> **Updated:** 2026-09-01

---

## 1. Production Readiness Checklist (§12.5)

### Product
- [x] Signup → onboarding → first scan → result works end to end
- [x] All core workflows complete (websites, issues, drift, reports, portal, billing)
- [x] Every list has a designed empty state
- [x] Every error has user-readable copy and a next action
- [x] Mobile layouts verified on the dashboard, issues, and portal
- [x] Accessibility audit passed (WCAG 2.2 AA in axe-core suite)
- [x] Approved terminology enforced; CI terminology check passing across all files
- [ ] Legal pages reviewed by counsel; disclaimer present in app, reports, and portal *(Human action)*

### Security
- [x] Tenant isolation tested across every model, including nested relations
- [x] SSRF guard passes the full vector suite (DNS rebinding, redirects, private IP ranges)
- [x] Chromium sandbox enabled; containers non-root with dropped capabilities
- [x] Rate limiting on every public and expensive endpoint
- [x] Secrets in platform secret store; no secrets in repository; secret scanning in CI
- [x] All webhook signatures verified before parsing (Stripe, Clerk, Resend)
- [x] CSP and security headers set and tested in E2E
- [x] Audit logging on all sensitive actions, including admin reads and impersonation
- [x] Dependency audit clean at high/critical (with documented exception for Prisma CLI)

### Scanner
- [ ] Browser workers stable over a 24-hour soak with no memory growth *(Requires staging cluster)*
- [x] All timeouts enforced at every level (navigation, consent interaction, total scan)
- [x] Retry policy correct; deterministic failures not retried
- [x] `PARTIAL` handled everywhere; no clean verdict from an incomplete scan
- [x] Evidence captured, sanitized, and traceable to findings
- [x] Fixtures F01–F30 passing; F28 (zero spurious drift) green
- [x] Consent adapter success rate > 90% per supported CMP on fixtures
- [x] Stuck-scan recovery verified by killing a worker mid-scan (`stuck-scan.drill.ts`)

### Database
- [x] All migrations tracked and applied cleanly to a fresh database
- [x] All indexes from Part V §5.3 present; query performance verified
- [x] Foreign keys and cascades correct
- [ ] Automated backups + PITR enabled *(Managed DB config)*
- [x] **Restore drill completed and documented** (`scripts/restore-drill.sh`)
- [x] Counter reconciliation job running and finding zero drift
- [ ] Connection pooling (PgBouncer) configured and load-tested *(Prod infra)*

### Billing
- [x] Checkout, portal, upgrade, downgrade, cancel all verified in Stripe test mode
- [x] Every webhook type handled; unknown types return 200
- [x] Webhook idempotency verified with replayed events
- [x] Subscription reconciliation job running
- [x] Failed payment degrades correctly without data loss
- [x] Entitlements enforced at all nine points
- [ ] Tax/VAT collection configured in live Stripe dashboard *(Production config)*

### AI
- [x] Every output schema-validated with Zod
- [x] Grounding check rejects fabricated evidence references
- [x] Terminology and claim checks rejecting unsupported assertions
- [x] Per-agency credit caps and platform daily budget enforced
- [x] Caching verified via deterministic input hashing; cost per feature measured
- [x] Every AI surface degrades gracefully when provider is down (circuit breaker)

### Infrastructure
- [x] CI/CD deploying web and workers with health-gated rollout (`deploy.yml`)
- [x] Migrations run as a discrete pre-deploy step with destructive-change guard
- [x] Structured logs shipping and searchable via Pino
- [x] Sentry error tracking configured on server, edge, and client tiers
- [ ] Alert rules and on-call routing configured in Sentry *(Production DSN required)*
- [ ] Autoscaling on queue depth configured and tested *(Prod infra)*
- [x] Graceful shutdown verified (no jobs lost on worker termination)
- [x] DR runbook written and walked through (`dev-doc/ops/disaster-recovery.md`)

---

## 2. Launch Checklist (§12.6)

### Technical
- [ ] Production build deployed to target hosting cluster
- [ ] All environment variables set (including identical `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` across web instances)
- [ ] Production database migrations applied
- [ ] **Tracker database seeded** (`packages/database/prisma/seed.ts`)
- [ ] Plans seeded and matched to live Stripe products/prices in USD, GBP, EUR
- [ ] Workers deployed with appropriate `WORKER_ROLES` segregation
- [ ] Redis instance provisioned with persistence and health check
- [ ] S3/MinIO bucket created with lifecycle rules, encryption, and CORS
- [ ] Stripe live keys and webhook endpoint configured
- [ ] Resend domain verified with SPF/DKIM/DMARC
- [ ] Clerk production instance configured with webhook secret
- [ ] Cloudflare Turnstile production keys configured
- [ ] Custom domain and TLS certificates active
- [ ] Sentry error monitoring live with production DSN

### Product
- [x] Pricing live and correct in all three currencies (USD, GBP, EUR)
- [x] Terms, Privacy, Cookie Policy, and Disclaimer published and linked
- [ ] Support email inbox live and monitored
- [ ] Onboarding tested by someone outside the engineering team
- [ ] Free scanner verified against 20 real public websites
- [x] Help content published at `/app/help`
- [x] Changelog published at `/changelog` and `/app/changelog`
- [ ] `/bot` page live explaining the scanner and allowlist guidance

### QA
- [x] Full test suite green (`npm run verify` passes with coverage gate)
- [x] Accessibility suite green (axe-core WCAG 2.2 AA on top 10 routes)
- [x] All 30 scanner fixtures passing
- [ ] Cross-browser validation (Chrome, Safari, Firefox, Edge)
- [ ] Mobile device validation (iOS Safari, Android Chrome)
- [ ] Billing flows tested in live mode with a real card and immediate refund
- [ ] AI outputs reviewed for tone and accuracy on 20 real issues
- [ ] Email templates verified in Gmail, Outlook, Apple Mail
- [ ] PDF reports verified in Preview, Acrobat, Chrome

### Go-Live
- [ ] Feature flags set for initial launch state
- [ ] Beta cohort of 5–10 agencies onboarded and interviewed
- [ ] Incident response escalation contacts documented
- [ ] Rollback procedure tested
- [ ] Launch announcement communications prepared
