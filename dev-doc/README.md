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

**Phases 0–5 are complete.** `npm run verify` — lint, typecheck, terminology
(385 files), **715 tests**, coverage gate, `next build` — passes against the whole
tree, and both processes have been started and exercised against the
docker-compose stack. The AI layer has produced validated, grounded output from
live OpenAI calls on both model tiers.

> ⚠️ **THIS TABLE AND THE PHASE DOCS DRIFTED BADLY ONCE.** In August 2026 an audit
> found this README claiming Phase 5 "not started" while it was complete and
> live-verified, and `phase-0-foundation.md` claiming `/app` did not exist while
> forty pages did. **Verify against the code, not against a checkbox.** The
> per-phase docs now carry a "what is and is not verified" table; Phase 4 and
> Phase 5 are the model to follow.

> **Three things in this codebase are CONTRACTS, not labels.** Each was found
> mis-numbered once, and each failure was silent:
>
> | Contract | Where | What a mismatch costs |
> |---|---|---|
> | Fixture ids `F01`–`F30` | §4.15, `packages/scanner/src/testing/fixtures.ts` | "F28 passes" stops meaning "no spurious drift" |
> | Rule ids `PDM-R001`–`PDM-R025` | §4.11, `packages/analysis/src/rules/` | Renaming one orphans every `Issue` row that stores it |
> | Queue and job ids | §7.2, `packages/scanner/src/queue/queues.ts` | BullMQ rejects a `:` at runtime, in production |
>
> All three now have a test that fails the build if one goes missing.

**Phase 0 detail.** Re-audited and corrected in August 2026. The repo layout is settled: the Next.js app stays at the root
(`src/`), only `packages/*` are workspace members, no Turborepo — see PLAN.md §10.9.

> This table is the single status source for Phase 0. `phases/phase-0-foundation.md`
> holds the step detail; if the two ever disagree, fix the phase doc.

| Task | State | Note |
|---|---|---|
| 0.1 repo structure | ✅ | npm workspaces (`packages/*`, `worker`), `.npmrc`. **No `apps/` move — decision reversed.** No `turbo.json`. **`pnpm-workspace.yaml` and `pnpm-lock.yaml` are deleted** — they were not inert: the `shadcn` CLI found pnpm's lockfile and ran `pnpm install` against an npm workspace |
| 0.2 `packages/*` scaffolding | 🟡 | `ai`, `analysis`, `config`, `database`, `email`, `notifications`, `reports`, `scanner`, `schemas`, `shared`, `storage` all exist. Remaining: `billing` (Phase 6). `ui` was **not** created — shadcn components live in `src/components/ui/` per the §10.9 single-app layout, and a package for them would be indirection with one consumer |
| 0.3 `packages/database` | ✅ | Full `schema.prisma` (46 models), `tenant.ts` (`forAgency`), factories, seed, tenancy + enum-parity suites all **run and pass against real Postgres**. Migrations **verified against a fresh database** — 47 tables from an empty DB. `prisma/seed-demo.ts` seeds a demo agency with 12 weeks of history |
| 0.4 `packages/shared` | ✅ | `errors`, `logger`, `permissions`, `flags`, `rate-limit`, `circuit-breaker`, `url/normalize`, `copy/*` — all present and tested |
| 0.5 `packages/schemas` | ✅ | Enums parity-tested against Prisma (36 assertions, including `@pdm/ai`'s third copy of `AIFeature`) |
| 0.6 Clerk integration | 🟡 | `proxy.ts`, `(auth)` catch-alls, `ClerkProvider`, `server/auth/context.ts` with `requireAgencyContext`/`requirePermission`/`requireWebsiteAccess` in place. `POST /api/webhooks/clerk` written (`verifyWebhook` from `@clerk/nextjs/webhooks` + Zod payload schemas in `@pdm/schemas/clerk`; env var is `CLERK_WEBHOOK_SIGNING_SECRET`) — **never exercised against a real Clerk event** |
| 0.7 docker-compose | ✅ | postgres, redis, minio (+ bucket init), mailpit |
| 0.8 design system | ✅ | Tokens, `@custom-variant dark`, focus ring, reduced-motion, type scale; `ThemeProvider` sets `.dark` pre-hydration. **Fonts are now self-hosted** via `next/font/local` from vendored `.woff2` (§11.2's privacy requirement — no build-time network dependency). **shadcn/ui installed** with 20 §11.4 primitives, wired to our tokens via a `--destructive` → `--danger` alias; `globals.css` was NOT rewritten. ⚠️ Our hand-written `Button` is kept (23 call sites use `variant="primary"`); `alert-dialog` and `dialog` were adapted to it |
| 0.9 CI | 🟡 | `.github/workflows/pr.yml` has all seven gates and now runs `test:coverage`, not `test` — the ≥85% `packages/scanner` gate was declared for four phases and executed by nothing. It **failed at 82.62%** the first time it ran; now 85.21–90.61% and passing. **Still never executed on GitHub** (no run observed) |
| 0.10 observability | 🟡 | `src/instrumentation.ts` (`register` + `onRequestError`), `/api/health`, `/api/health/ready` written. Sentry deferred to Phase 7 — the DSN is empty until then |
| 0.11 route groups | ✅ | `(marketing)`, `(auth)`, `(app)`, `(onboarding)`, `(portal)` all exist with their own layouts. `(admin)` is Phase 6 and deliberately absent |

> ✅ **`npm run verify` passes against this tree**, including the coverage gate.
> The remaining 🟡 rows are the honest ones: `packages/billing` is Phase 6, the
> Clerk webhook has never seen a real Clerk event, and CI has never been observed
> running on GitHub.

**Immediate next:** Phase 6, starting with **6.2 entitlements before 6.1 Stripe** —
plan logic must live in one place, and `src/server/entitlements.ts` is currently a
stub that returns `null` for every limit.

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
| [Phase 0](phases/phase-0-foundation.md) | Monorepo, schema, auth, design system, CI | 🟡 Closed out — 3 named gaps remain (Clerk webhook unexercised, CI never observed, `packages/billing` is Phase 6) |
| [Phase 1](phases/phase-1-core-saas-shell.md) | Clients + websites, no scanning yet | ✅ Complete |
| [Phase 2](phases/phase-2-scanner.md) | A real scan runs end to end | ✅ Complete |
| [Phase 3](phases/phase-3-intelligence.md) | Evidence becomes findings, drift, score | ✅ Complete |
| [Phase 4](phases/phase-4-agency-workflow.md) | Alerts, reports, client portal | 🟡 Built; email proven live. One gap: the magic-link inbox→session round trip |
| [Phase 5](phases/phase-5-ai.md) | Grounded explanation and recommendation | ✅ Complete — both tiers verified against live OpenAI |
| [Phase 6](phases/phase-6-commercial-admin.md) | Billing, free scanner, admin panel | ⬜ **Next.** Start at 6.2 entitlements |
| [Phase 7](phases/phase-7-hardening-launch.md) | Security, load, a11y, DR, launch | 🟡 Hardening, DR, deploy pipeline, E2E & changelog built; operational launch steps documented |

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
