# dev-doc — Development Documentation

Working documentation for building Privacy Drift Monitor. Derived from `PLAN.md`, which
remains the **source of truth** — these documents reorganize it into build order and
per-feature working sheets. They do not replace it and they do not override it.

> If a `dev-doc` file and `PLAN.md` disagree, `PLAN.md` wins. Fix the `dev-doc` file.

## Structure

```
dev-doc/
├── README.md                      ← you are here
├── 00-development-workflow.md     ← how we work: branches, gates, definition of done
├── phases/                        ← the step-by-step build order (do these in sequence)
│   ├── phase-0-foundation.md
│   ├── phase-1-core-saas-shell.md
│   ├── phase-2-scanner.md
│   ├── phase-3-intelligence.md
│   ├── phase-4-agency-workflow.md
│   ├── phase-5-ai.md
│   ├── phase-6-commercial-admin.md
│   └── phase-7-hardening-launch.md
└── features/                      ← one working sheet per feature (reference, not order)
    ├── 01-tenancy-auth-rbac.md
    ├── 02-clients.md
    ├── 03-websites.md
    ├── 04-url-validation-ssrf.md
    ├── 05-scan-engine.md
    ├── 06-consent-engine.md
    ├── 07-evidence-system.md
    ├── 08-tracker-detection.md
    ├── 09-rule-engine-issues.md
    ├── 10-privacy-drift.md
    ├── 11-health-score.md
    ├── 12-dashboard.md
    ├── 13-notifications-alerts.md
    ├── 14-reports-white-label.md
    ├── 15-client-portal.md
    ├── 16-ai-layer.md
    ├── 17-billing-entitlements.md
    ├── 18-free-public-scanner.md
    ├── 19-admin-panel.md
    ├── 20-marketing-site.md
    ├── 21-design-system.md
    └── 22-observability-ops.md
```

**Phases are the order. Features are the detail.** Start a piece of work by opening the
phase doc, pick a task, then open the feature doc it points to for the full specification.

## Current status

**Phase 0 is in progress.** The repo layout is settled: the Next.js app stays at the root
(`src/`), only `packages/*` are workspace members, no Turborepo — see PLAN.md §10.9.

> This table is the single status source for Phase 0. `phases/phase-0-foundation.md`
> holds the step detail; if the two ever disagree, fix the phase doc.

| Task | State | Note |
|---|---|---|
| 0.1 repo structure | ✅ | npm workspaces (`packages/*`), `.npmrc`. **No `apps/` move — decision reversed.** No `turbo.json`; a single package has nothing to orchestrate. `pnpm-workspace.yaml` is an inert tombstone still awaiting `rm` |
| 0.2 `packages/*` scaffolding | 🟡 | `config`, `database`, `shared`, `schemas`, `scanner` exist. Remaining: `ai`, `billing`, `email`, `reports`, `storage`, `ui` |
| 0.3 `packages/database` | 🟡 | Full `schema.prisma`, `client.ts`, `tenant.ts` (`forAgency`), `testing/factories.ts`, seed + ~250-vendor `trackers.json`, `__tests__/tenancy.test.ts`, `__tests__/enum-parity.test.ts`. A migration exists under `prisma/migrations/`. **Unverified:** the suites have never been run |
| 0.4 `packages/shared` | 🟡 | `errors`, `logger`, `permissions`, `flags`, `url/normalize`, `copy/terminology`, `copy/en.ts` + `t()` + unit tests + `scripts/check-terminology.ts` written. Remaining: rate limiter, circuit breaker |
| 0.5 `packages/schemas` | 🟡 | Enums (parity-tested against Prisma) + shared Zod primitives written |
| 0.6 Clerk integration | 🟡 | `proxy.ts`, `(auth)` catch-alls, `ClerkProvider`, `server/auth/context.ts` with `requireAgencyContext`/`requirePermission`/`requireWebsiteAccess` in place. `POST /api/webhooks/clerk` written (`verifyWebhook` from `@clerk/nextjs/webhooks` + Zod payload schemas in `@pdm/schemas/clerk`; env var is `CLERK_WEBHOOK_SIGNING_SECRET`) — **never exercised against a real Clerk event** |
| 0.7 docker-compose | ✅ | postgres, redis, minio (+ bucket init), mailpit |
| 0.8 design system | 🟡 | Tokens, `@custom-variant dark`, focus ring, reduced-motion and the type scale are in `globals.css`; Inter + JetBrains Mono wired via `next/font/google`; `ThemeProvider` (`src/components/theme-provider.tsx`, no next-themes) sets the `.dark` class pre-hydration and exposes `useTheme()`. Remaining: shadcn install, base components, and the `next/font/local` swap §11.2 specifies |
| 0.9 CI | 🟡 | `.github/workflows/pr.yml` written, never executed |
| 0.10 observability | 🟡 | `src/instrumentation.ts` (`register` + `onRequestError`), `/api/health`, `/api/health/ready` written. Sentry deferred to Phase 7 — the DSN is empty until then |
| 0.11 route groups | 🟡 | `SiteHeader` is out of the root layout, so marketing chrome no longer leaks into `/app`. **Remaining:** `git mv src/app/page.tsx src/app/(marketing)/page.tsx` plus a `(marketing)/layout.tsx`, and the `(app)`/`(admin)`/`(portal)` groups |

> ⚠️ **Almost nothing in this phase has been verified.** `npm run verify` — lint,
> typecheck, terminology, test, build — has never completed against this tree. Every 🟡
> means "code written", not "code working". Treat the whole phase as unverified until the
> commands in §"Verifying Phase 0" below have been run and pass.

**Immediate next:** run the verification commands and fix what they surface, then finish
0.2 (remaining packages), 0.6 (Clerk webhook sync) and 0.11 (the file move).

## Verifying Phase 0

**Package manager: npm** (npm workspaces). Not pnpm, not yarn.

```bash
docker compose up -d                 # postgres, redis, minio, mailpit
npm install                          # vitest, tsx, and the workspace links
npm run db:generate                  # prisma generate — required before typecheck
npm run db:migrate                   # applies prisma/migrations to your local database
npm run verify                       # lint → typecheck → terminology → test → build
```

Run them in that order. Two ordering constraints are real, not stylistic:

- `typecheck` fails before `db:generate`, because `packages/database` imports types
  Prisma has not emitted yet — and `__tests__` read `Prisma.dmmf`, which only the
  generated client carries.
- `typecheck` runs `next typegen` for you (see the root `typecheck` script). Layouts and
  pages use the global `LayoutProps<'/'>` / `PageProps<'/route'>` helpers, which live in
  `.next/types` and do not exist on a clean checkout.

`npm run verify` is the whole gate in one command; run the steps individually
(`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) when you want
to see which one fails first without the others masking it.

| Phase | Goal | Status |
|---|---|---|
| [Phase 0](phases/phase-0-foundation.md) | Monorepo, schema, auth, design system, CI | 🟡 In progress |
| [Phase 1](phases/phase-1-core-saas-shell.md) | Clients + websites, no scanning yet | ⬜ Not started |
| [Phase 2](phases/phase-2-scanner.md) | A real scan runs end to end | ⬜ Not started |
| [Phase 3](phases/phase-3-intelligence.md) | Evidence becomes findings, drift, score | ⬜ Not started |
| [Phase 4](phases/phase-4-agency-workflow.md) | Alerts, reports, client portal | ⬜ Not started |
| [Phase 5](phases/phase-5-ai.md) | Grounded explanation and recommendation | ⬜ Not started |
| [Phase 6](phases/phase-6-commercial-admin.md) | Billing, free scanner, admin panel | ⬜ Not started |
| [Phase 7](phases/phase-7-hardening-launch.md) | Security, load, a11y, DR, launch | ⬜ Not started |

Update the status column as phases complete. Keep it honest — a phase is done only when its
acceptance criteria all pass, not when the code is written.

## Status legend

Used in every checklist in this folder.

| Mark | Meaning |
|---|---|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done and verified against its acceptance criteria |
| ⛔ | Blocked — the blocker must be named inline |
| ⏭️ | Deliberately deferred — the reason must be named inline |

## Effort scale

From `PLAN.md` §12.3, for one experienced full-stack engineer. **Estimates, not commitments.**

| | |
|---|---|
| **S** | ≤ 3 days |
| **M** | ~1 week |
| **L** | ~2 weeks |
| **XL** | ~3–4 weeks |

## Feature doc anatomy

Every file in `features/` follows the same shape, so you always know where to look:

1. **Metadata** — phase, priority, effort, value, plan refs, status
2. **What it is** and **why it exists** (which persona, which job)
3. **Dependencies** — what must exist first
4. **Scope** — explicitly in and explicitly out
5. **Build steps** — ordered checklist
6. **Acceptance criteria** — the bar for "done", lifted from `PLAN.md` §12.3/§12.4
7. **Tests required** — mapped to the ladder in §12.2
8. **Failure modes** — what breaks and what we do about it
9. **Plan references** — where to read the full spec before writing code

## Reading PLAN.md

`PLAN.md` is ~402 KB and exceeds a single file read. Index it first, then read the range:

```bash
grep -n "^#\{1,3\} " PLAN.md      # heading index with line numbers
grep -n "^# Part" PLAN.md         # part boundaries
```

Cite sections as `Part IV §4.12` — line numbers move, section numbers don't.

## The five rules that override everything

Restated here because they are architectural, not stylistic. Full text in `AGENTS.md`.

1. The deterministic scanner is the only source of truth. An LLM never establishes a fact.
2. AI explains evidence and never invents it — every output carries resolvable `evidence_refs`.
3. Findings render with or without AI. AI is additive, never load-bearing.
4. Tenant isolation is enforced at the data-access layer, scoped by `agencyId`.
5. `PARTIAL` is a first-class outcome. An incomplete scan never produces a clean verdict.

Plus the terminology ban list (Part I §1.12): never *violation*, *illegal*, *GDPR breach*,
*non-compliant*, *confirmed*, *you must*. Use *potential issue*, *detected*, *not detected*,
*could not be determined*.
