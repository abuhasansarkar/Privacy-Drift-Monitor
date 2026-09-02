# Privacy Drift Monitor — Project Overview

> **Continuous privacy and consent monitoring for web agencies.** Loads each client website in a real browser (Playwright/Chromium) across four consent journeys — no consent, Reject All, Accept All, withdraw — records every request, cookie and storage write tagged with consent state, diffs each scan against the last to detect **privacy drift**, and turns that into evidence-backed findings, alerts and white-label reports.

**Source of truth:** `PLAN.md` (~402KB, ~7,800 lines, 13 Parts). This file is a readable index — `PLAN.md` wins on any disagreement.

---

## 1. Stack — Verified Baseline

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (Turbopack for dev + build) | 16.3.3 |
| UI | React 19, Tailwind v4 (`@theme inline`, no `tailwind.config.js`), shadcn/ui 20 primitives, `next/font/local` (Inter Variable + JetBrains Mono self-hosted) | - |
| Auth | Clerk Core 3 (`@clerk/nextjs@^7`, `<Show when="signed-in">`) | 7.8.3 |
| DB | PostgreSQL 16 + Prisma 6 + `forAgency(agencyId)` tenant extension | 16 / 6.19.3 |
| Queue | Redis 7 + BullMQ 5 (7 queues: scan, report, notification, email, digest, ai, free-scan) | - |
| Browser | Playwright/Chromium, pooled contexts, `page.route` SSRF guard + media blocking | - |
| Billing | Stripe (24 prices, 3 currencies, checkout + portal + webhooks + reconciliation) | - |
| Email | Resend (+ Mailpit locally) | - |
| Storage | S3-compatible (MinIO locally, lifecycle + signed URLs) | - |
| AI | `AIProvider` abstraction, OpenAI `gpt-4o-mini` (standard) + `gpt-5-nano` (advanced), Zod-validated prompts `*_V<n>` | - |
| Observability | Sentry (`@sentry/nextjs`), pino logger, `/api/health` + `/api/health/ready`, PostHog | - |
| Package manager | **npm workspaces** (`package-lock.json`, lockfileVersion 3) — pnpm is deleted | - |

**Next.js 16 traps already handled:** `src/proxy.ts` not `middleware.ts`, `cookies()/headers()/params` are Promises, `cacheComponents` OFF, `revalidateTag(tag, profile)` 2-arg, no `webpack` key, `PageProps<'/route'>` global.

---

## 2. Repository Layout

```
drift-monitor/
├── src/                 Next.js app — `@/*` → `./src/*` (no apps/ directory, per §10.9)
│   ├── app/             (marketing) / (auth) / (app) / (portal) / (admin) / (onboarding) + api/
│   ├── components/      ui/ (shadcn) + domain components
│   ├── server/          auth, entitlements, queries, actions, services
│   ├── lib/             cn, format, sentry, labels
│   └── proxy.ts         Clerk + CSP (two-policy: nonce for dynamic, unsafe-inline for static marketing)
├── packages/            npm workspaces: ai, analysis, billing, config, database, email, notifications, reports, scanner, schemas, shared, storage
├── worker/              separate Node process — scan + analysis + notification + email + report + digest + ai + free-scan + scheduler
├── e2e/                 Playwright E2E (axe-core WCAG AA)
├── content/             marketing/blog/guides MDX
├── dev-doc/             phases/ (14) + features/ (28) + ops/
└── PLAN.md              source of truth
```

---

## 3. Pages — 87 Routes (next build output)

**Marketing (static):** `/`, `/features`, `/how-it-works`, `/pricing`, `/free-scanner`, `/free-scanner/[token]`, `/blog`, `/blog/[slug]`, `/resources`, `/about`, `/contact`, `/legal/[doc]`, `/bot`
**App:** `/app`, `/app/websites`, `/app/websites/[websiteId]/*` (changes, consent, cookies, evidence, issues, reports, scans, trackers), `/app/issues`, `/app/drift`, `/app/alerts`, `/app/reports`, `/app/trackers`, `/app/clients`, `/app/team`, `/app/billing`, `/app/settings/*` (ai, audit, branding, ignored, notifications, scanning, security), `/app/notifications`, `/app/help`, `/app/changelog`, `/app/onboarding`, `/app/ai`
**Portal:** `/portal/*` (magic-link, no Clerk)
**Admin:** `/admin/*` (15 pages: agencies, users, websites, scans, issues, trackers, billing, queue, logs, feature-flags, ai-usage, system-health, settings)
**API:** `/api/websites/*`, `/api/scans/[scanId]/progress`, `/api/reports/[reportId]/download`, `/api/billing/*`, `/api/ai/*`, `/api/webhooks/{clerk,stripe,resend}`, `/api/health*`, `/api/portal/*`, `/api/public/*`

---

## 4. Packages

| Package | Role |
|---|---|
| `@pdm/database` | Prisma schema (46 models), `tenant.ts` (`forAgency`), `unsafeGlobalClient(reason)`, repositories, factories, seed |
| `@pdm/scanner` | Playwright engine, 4 consent journeys, `EvidenceCollector`, consent adapters (incl. Usercentrics "Deny"), SSRF guard (`net/guard.ts`), fixtures F01–F30 |
| `@pdm/analysis` | Tracker detection, cookie analysis, 25 rules `PDM-R001–R025`, risk engine, drift engine, health score |
| `@pdm/schemas` | Zod schemas (centralized validation), enum parity with Prisma |
| `@pdm/shared` | `copy/en.ts` + `copy/terminology.ts`, `errors`, `logger`, `permissions`, `flags`, `rate-limit`, `circuit-breaker`, `url/normalize` |
| `@pdm/billing` | Catalogue, entitlements (9 enforcement points), `STRIPE` → `entitlements` resolver, grace handling |
| `@pdm/reports` | 5 report types, `branding.ts` (`whiteLabelEntitlement`), PDF/HTML templates (esbuild JSX fix) |
| `@pdm/storage` | S3 wrapper, signed URLs, retention lifecycle |
| `@pdm/notifications` + `@pdm/email` | Alert + Resend/Mailpit, `EmailRejectedError` split, RFC 5322 `EMAIL_FROM` |
| `@pdm/ai` | `AIProvider`, 8 prompts `*_V<n>` (inputHash cache), validators (grounding/terminology/claim), budget (`budget.ts` + `DEFAULT_PRICING`), `creditsFor()` |
| `@pdm/config` | Central env, feature flags |

---

## 5. Phases — Status (dev-doc/phases)

| Phase | Goal | Status |
|---|---|---|
| 0 — Foundation | Monorepo, schema, auth, design system, CI | ✅ Closed (3 honest gaps: Clerk webhook unexercised, CI never observed on GitHub, `AI_ASSISTANT_PAGE` off) |
| 1 — Core SaaS Shell | Clients + websites | ✅ Complete |
| 2 — Scanner | Real scan end-to-end (4 phases, pool, timeouts) | ✅ Complete |
| 3 — Intelligence | Evidence → findings, drift, score | ✅ Complete |
| 4 — Agency Workflow | Alerts, reports, portal (email proven live via Resend) | ✅ Built (magic-link inbox→session gap noted) |
| 5 — AI | Grounded explanation (both tiers live-verified vs OpenAI) | ✅ Complete |
| 6 — Commercial & Admin | Billing, free scanner, admin, flags, retention | ✅ Complete |
| 7 — Hardening & Launch | Security, load, a11y, DR, deploy | ✅ Hardening + E2E + changelog built |
| 8 — US Compliance & GPC | GPC signal detection | ✅ Complete |
| 9 — CIPA Wiretap & Session Replay | Wiretap/session-replay risk analyzer | ✅ Complete |
| 10 — Geo-Proxy Matrix | Multi-region proxy mesh & matrix scans | ✅ Complete |
| 11 — Policy-to-Code | AI policy-to-code reconciliation | ✅ Complete |
| 12 — Interactive Journeys | Advanced detection (shadow DOM, etc.) | ✅ Complete |
| 13 — Automated Remediation | GTM auto-fix & V2 reports | ✅ Complete |

All 28 feature sheets in `dev-doc/features/01-28` map to the above.

---

## 6. Non-Negotiable Product Rules

1. **Deterministic scanner is only source of truth** — LLM never decides if a request/cookie/tracker happened.
2. **AI explains evidence, never invents it** — every output carries `evidence_refs` resolvable to `IssueEvidence` PKs.
3. **Findings render with or without AI** — provider outage degrades explanations only.
4. **Tenant isolation at data-access layer** — `agencyId` scoped via `forAgency`; `eslint` forbids raw `prisma` in `src/app/**`.
5. **`PARTIAL` is first-class** — incomplete scan never yields clean verdict.
6. **Nothing downstream of `EvidenceCollector` adds facts** — pipeline is replayable.

**Banned terminology (CI-enforced, `scripts/check-terminology.ts`):** Use *Potential issue / Tracker detected before consent / Review recommended / Technical evidence* — never *Violation / GDPR breach / You must / Non-compliant / Confirmed* (`packages/shared/src/copy/terminology.ts`).

---

## 7. Verification — Current Run

```bash
npm run verify  # lint → typecheck → terminology → test:coverage → build
```

| Gate | Result | Detail |
|---|---|---|
| `npm run lint` | ✅ PASS | eslint flat config, 0 errors (`no-restricted-imports` for `prisma`) |
| `npm run typecheck` | ✅ PASS | `next typegen` + `tsc --noEmit` (root + 12 workspaces) |
| `npm run check:terminology` | ✅ PASS | 506 files scanned |
| `npm run test:coverage` | ✅ PASS | **60 test files, 950 tests passed** (Duration ~335s). Coverage thresholds: `packages/scanner` 85% + `packages/billing` 85% met |
| `npm run build` | ✅ PASS | Next 16.3.3 Turbopack, 87 routes, `ƒ Proxy (Middleware)` |

**DB-backed suites require `docker compose up -d`** (postgres, redis, minio, mailpit) — `vitest.config.ts` uses isolated `drift_monitor_test` DB (`test/global-setup.ts`).

**Known long run:** `npm test` needs >120s (observed 211–304s for tests alone). CI must set timeout 600s.

---

## 8. Issues Found & Fixed (this audit)

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | `.env` had `AI_MODEL_STANDARD=gpt-5-nano` / `AI_MODEL_ADVANCED=gpt-4o-mini` **swapped** vs `.env.example` and `packages/ai/src/config.ts:137` defaults. `packages/ai/src/budget.ts:221` `DEFAULT_PRICING` prices standard at $0.15/$0.60 and advanced at $0.05/$0.40 — swap silently misprices every call and inverts credit cost (1 vs 3 credits). | Critical | `.env:80-81` corrected to `standard=gpt-4o-mini`, `advanced=gpt-5-nano` |
| 2 | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` empty in `.env` (and template). PLAN.md §12.6 requires stable key across instances or Server Action closures break. | Critical | Generated `openssl rand -base64 32` → `NETll/yehCnRUl14avzlthp83N8Br9WY4qOk4r/fabE=` set in `.env` |
| 3 | `FREE_SCAN_IP_SALT` empty — stored IP hash of v4 address is enumerable (§3.2, §10.4). | High | Generated `openssl rand -hex 32` → `75cb26c4084bdd171cd37ad2b720d85667aa4777661b330f3777d57d094` set |
| 4 | `npm audit` — `deepmerge-ts <8.0.0` High (GHSA-ggr8-5vv4-36mx) via `prisma@6.19.3` → `@prisma/config@6.19.3` → `deepmerge-ts@7.1.5`. `npm audit fix` does not resolve; latest stable Prisma v6 still pinned. | High (low exploitability) | **Documented, not patched.** Vulnerability is build-time only (`prisma config` file merge), not reachable from user input. Mitigated by Layer 2/3: egress firewall + no metadata credentials on workers (§10.3). Fix lands with Prisma v8 major — tracked, not forced. |
| 5 | `pnpm-workspace.yaml` / `pnpm-lock.yaml` | Info | Correctly deleted — workspace is npm only (`package-lock.json` lockfileVersion 3). Verified absent. |
| 6 | `globals.css` font-family, WCAG tokens, self-hosted fonts | Info | Already fixed — `body` uses `var(--font-sans)`, 7 tokens darkened (measured 4.76–5.91:1 vs 4.5:1), `next/font/local` vendored woff2 (no CDN). |

**No fix needed (verified PASS):** Tenant isolation (`eslint` rule + `forAgency`), SSRF guard (`net/guard.ts` R1-R7 + redirect re-check), terminology, white-label entitlement resolver, billing 9 enforcement points, grace-retry, email RFC 5322, `export *` barrel, `React is not defined` (report templates), consent "Deny" adapter.

---

## 9. Production Readiness — Remaining Checklist (not code)

These are **env/infra**, correctly empty in dev (fail-closed):

- `STRIPE_WEBHOOK_SECRET` / `RESEND_WEBHOOK_SECRET` — webhook handlers `401` when unset (correct). Set from Stripe/Resend dashboard in prod.
- `TURNSTILE_SITE_KEY` + `SECRET` — free scanner abuse control (§3.2). Set prod keys.
- `SUPPORT_EMAIL` — contact form returns error when unset (correct) instead of silently dropping.
- Resend domain — currently `onboarding@resend.dev` (restricted). Verify prod domain for SPF/DKIM/DMARC.
- Clerk prod instance + `CLERK_WEBHOOK_SIGNING_SECRET` prod value.
- S3 bucket lifecycle/versioning/CORS, Redis provisioned, `WORKER_ROLES` per replica, Sentry prod DSN.
- DB: `prisma migrate deploy` as pre-deploy step, `npm run db:seed` (vendors) + `npm run stripe:provision` (24 prices), PITR backups + restore drill, PgBouncer.
- CI: `.github/workflows/pr.yml` 7 gates (now `test:coverage` not `test`) — never observed running on GitHub yet.

Full checklist: `PLAN.md` Part XII §12.5 + §12.6.

---

## 10. Commands

```bash
npm install
npm run db:generate        # prisma generate — REQUIRED before typecheck
npm run db:migrate         # prisma migrate dev
npm run dev                # next dev (Turbopack) — http://localhost:3000
npm run worker             # worker (scan + scheduler + ai ...)
npm run lint               # eslint (next lint removed in 16)
npm run typecheck          # next typegen + tsc --noEmit (all workspaces)
npm run check:terminology  # 506 files
npm run test               # vitest run — needs docker compose up -d
npm run test:coverage      # with v8 + 85% gates (scanner + billing)
npm run build              # next build (Turbopack) — 87 routes
npm run verify             # all gates in sequence (allow 600s timeout)
docker compose up -d       # postgres, redis, minio, mailpit
npx tsx --env-file=.env worker/src/ai.smoke.ts  # live OpenAI smoke (both tiers)
```

**Workspace-scoped:** `npm run <script> -w @pdm/<pkg>` · After dep change: `npm install` and commit `package-lock.json` (`npm ci` in CI).

---

## 11. Environment — Template (` .env.example` is the contract)

Key variables (see `PLAN.md` Part X §10.10 for full table):

```
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY  # openssl rand -base64 32, stable across deploys
DATABASE_URL / REDIS_URL / S3_*      # docker-compose defaults
NEXT_PUBLIC_CLERK_* / CLERK_SECRET_KEY / CLERK_WEBHOOK_SIGNING_SECRET
RESEND_API_KEY / RESEND_WEBHOOK_SECRET / EMAIL_FROM ("Name <addr>")
STRIPE_* / STRIPE_WEBHOOK_SECRET
AI_PROVIDER=openai / AI_API_KEY / AI_MODEL_STANDARD=gpt-4o-mini / AI_MODEL_ADVANCED=gpt-5-nano / AI_REASONING_EFFORT=minimal
SCAN_* / FREE_SCAN_* / FREE_SCAN_IP_SALT  # hex 32
SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN
```

Never put a secret behind `NEXT_PUBLIC_`. `.env*` is gitignored; `.env.example` is the only committed template.

---

## 12. Contracts That Must Not Drift (tests fail build if broken)

| Contract | Location | Cost of mismatch |
|---|---|---|
| Fixture ids `F01–F30` | `packages/scanner/src/testing/fixtures.ts`, §4.15 | "F28 passes" stops meaning "no spurious drift" |
| Prompt versions `<FEATURE>_V<n>` | `packages/ai/src/prompts/index.ts`, §8.7 | Edit without bump serves OLD prompt forever via `inputHash` |
| Rule ids `PDM-R001–R025` | `packages/analysis/src/rules/`, §4.11 | Rename orphans every `Issue` row |
| Queue & job ids | `packages/scanner/src/queue/queues.ts`, §7.2 | BullMQ rejects `:` at runtime |

Anything ours (not the plan) carries `X` prefix (`X01`, `PDM-X01`).

---

*Generated from live `npm run verify` (lint, typecheck, terminology, 950 tests, build) + PLAN.md + dev-doc audit. `PLAN.md` is the source of truth.*
