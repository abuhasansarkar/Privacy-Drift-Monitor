# Phase 0 — Foundation

> **Goal:** a monorepo where every subsequent phase can be built and shipped safely.
> **Dependencies:** none · **Status:** 🟡 Closed out — three named gaps remain
> **Plan ref:** Part XII §12.3 (Phase 0), §12.1 (repo structure), Part V (schema), Part XI (tokens)
>
> ⚠️ **Per-task status lives in [`../README.md`](../README.md), not here.** This file is the
> step detail. The two tables drifted apart once already — 0.7 was ✅ in one and ⬜ in the
> other — so the Task table below now points at the single source instead of duplicating it.

This phase ships no user-visible feature. Its output is the ability to build everything else
without re-architecting. Do not shortcut it — Part 0 §0.2 P4 is explicit that the scan
pipeline, tenancy model and evidence schema are built once, correctly.

## Tasks

Status column deliberately omitted — see [`../README.md`](../README.md).

| # | Task | Effort | Feature doc |
|---|---|---|---|
| 0.1 | ~~Convert to a pnpm + Turborepo monorepo; move `src/` → `apps/web/src/`~~ **CHANGED — see below** | S | — |
| 0.2 | Create `packages/*` with shared tsconfig/eslint presets, strict mode everywhere | S | — |
| 0.3 | `packages/database`: Prisma init, full schema, first migration, seed script | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) |
| 0.4 | `packages/shared`: error taxonomy, Pino logger, rate limiter, circuit breaker, permissions, copy module | M | [22-observability-ops](../features/22-observability-ops.md) |
| 0.5 | `packages/schemas`: base Zod schemas and shared enums | S | — |
| 0.6 | Clerk integration: `proxy.ts`, `requireAgencyContext`, webhook sync, login/signup routes | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) |
| 0.7 | `docker-compose.yml` — postgres, redis, minio, mailpit | S | — |
| 0.8 | Design system: Tailwind v4 tokens, shadcn install, base components, theme provider, dark mode | M | [21-design-system](../features/21-design-system.md) |
| 0.9 | CI: PR workflow — lint, typecheck, test, build, secret scan, migration check | M | — |
| 0.10 | `instrumentation.ts`, structured logging, Sentry, `/api/health` + `/api/health/ready` | S | [22-observability-ops](../features/22-observability-ops.md) |

## Step-by-step

### 1. Repository structure (0.1, 0.2)

> **DECISION CHANGED.** No `apps/` layer. The Next.js app stays at the repo root in the
> default `create-next-app` layout (`src/`). Only `packages/*` are workspace members.
> Full rationale and accepted cost in PLAN.md Part X §10.9.
>
> ```
> drift-monitor/
> ├── src/              Next.js app — default structure
> ├── packages/         shared with the Phase 2 worker
> ├── worker/           separate Node process (added in Phase 2)
> └── package.json      one package
> ```

- [x] **npm workspaces** — `"workspaces": ["packages/*", "worker"]` in the root
      `package.json`. **Not pnpm.**
- [x] `pnpm-workspace.yaml` and `pnpm-lock.yaml` **deleted**. They were described as
      "inert tombstones" and were not: the `shadcn` CLI picks a package manager by
      looking for a lockfile, found pnpm's, and ran `pnpm install` against an npm
      workspace — rewriting the pnpm lockfile and installing into `node_modules/.pnpm`
      where npm could not see it. Do not reintroduce either file.
- [x] `packages/config`, `packages/database`, `packages/shared`, `packages/schemas`,
      `packages/scanner` (SSRF guard only — pulled forward from Phase 1 task 1.7)
- [x] Remaining packages: `ai`, `email`, `reports`, `storage`, `analysis`, `notifications`.
      `billing` is Phase 6. **`ui` was deliberately not created** — shadcn components
      live in `src/components/ui/`, and a package with one consumer is indirection
- [x] `packages/config` holds the shared tsconfig presets; every other package extends
      them. `strict: true` everywhere, no exceptions.
- [x] `worker/` bootstrap — landed in Phase 2 as a sibling of `src/`
- [x] No Turborepo — a single app has nothing to orchestrate. Root scripts call
      `npm run <script> -w @pdm/<pkg>` directly.

> npm resolves the local workspace for `"@pdm/x": "*"`. The pnpm-only
> `"workspace:*"` protocol is **not** valid in npm and will try to hit the registry.

> ⚠️ Do **not** add a `webpack` key to `next.config.ts` — Turbopack is the default for both
> `next dev` and `next build` in Next 16, and a webpack config makes the build fail.

### 2. Database (0.3)

- [x] Read **Part V** in full before writing the schema. Do not draft models from memory.
- [x] `packages/database/prisma/schema.prisma` — 46 models, all foreign keys declared
- [x] All indexes from Part V §5.3 — they are designed up front deliberately, because the
      database is a named bottleneck risk (§12.7)
- [x] First migration generated under `prisma/migrations/`
- [x] **Verified against a fresh database** — `prisma migrate deploy` on an empty DB
      produces 47 tables (46 models + `_prisma_migrations`)
- [x] `client.ts` — single Prisma instance, pooling, query timing
- [x] `tenant.ts` — `forAgency(agencyId)`; this is the enforcement point for tenant isolation
- [x] `testing/factories.ts` — `makeAgency`, `makeWebsite`, `makeScanWithEvidence`
- [x] Seed script + `prisma/seed/trackers.json` (~250 vendors)
- [x] `prisma/seed-demo.ts` (`npm run db:seed:demo`) — 4 clients, 5 websites,
      **12 weeks of weekly scans** incl. one `PARTIAL`, issues with `IssueEvidence`
      attached, **12 drift events (8 inside the 30-day feed window)**, and health
      scores that move. Deterministic and idempotent; refuses to run off localhost.
      `-- --agency <slug>` attaches it to an existing agency — without that, tenant
      isolation correctly hides it from your own account and every page looks empty
- [x] **Tests get their own database.** `test/global-setup.ts` creates and migrates
      `<db>_test`; `vitest.config.ts` overrides `DATABASE_URL` for the workers.
      Previously `resetDatabase()`'s `TRUNCATE … CASCADE` ran against the dev
      database, so `npm test` silently destroyed seeded demo data

### 3. Shared foundations (0.4, 0.5)

- [x] `shared/errors.ts` — `AppError` subclasses with **stable machine-readable codes**, plus
      a log-only `reason` option so internal identifiers never reach an exposed message
- [x] `shared/logger.ts` — Pino, structured, redaction paths
- [x] `shared/rate-limit.ts`, `shared/circuit-breaker.ts`
- [x] `shared/permissions.ts` — the RBAC matrix, shared by UI and server, `can(role, permission)`
- [x] `shared/copy/terminology.ts` — approved phrases + the forbidden list (Part I §1.12)
- [x] `shared/copy/en.ts` + `t()` — §11.11, no user-facing string literals in JSX
- [x] `shared/url/normalize.ts` — eTLD+1 via the Public Suffix List
- [x] `scripts/check-terminology.ts` — CI check greping `src/`, `packages/`, `content/`,
      `emails/` (**not** `apps/` — that directory no longer exists). Skips `*.test.ts`
      assertion files, but **does** scan fixtures inside `__tests__`
- [x] `packages/schemas` — base Zod schemas, shared enums, parity-tested against the Prisma
      enums by `packages/database/src/__tests__/enum-parity.test.ts`

### 4. Auth (0.6)

- [x] `src/proxy.ts` — **not** `middleware.ts`; Node runtime only, and setting
      `runtime` inside it throws. (No `apps/web/` prefix — see the decision box above)
- [x] Clerk `<SignIn/>` / `<SignUp/>` at catch-all routes `(auth)/login/[[...rest]]` and
      `(auth)/signup/[[...rest]]`
- [ ] Style them via the `appearance` object to match our tokens — still Clerk defaults
- [x] `POST /api/webhooks/clerk` exists (`verifyWebhook` + Zod payload schemas).
      ⚠️ **Never exercised against a real Clerk event** — the org↔Agency sync is unproven
- [x] `server/auth/context.ts` — `requireAgencyContext`, `requirePermission`,
      `requireWebsiteAccess`
- [x] **Every Server Action re-checks authorization.** 18 action files, each opening with
      `requirePermission()`. Phase 5's AI actions additionally assert §6.2 website scope

> ⚠️ **Clerk v7 is Core 3.** `<SignedIn>` / `<SignedOut>` were removed and throw at render
> time. Use `<Show when="signed-in" | "signed-out">`. See the Clerk section in `AGENTS.md`.

### 5. Design system (0.8)

- [x] Self-hosted Inter Variable + JetBrains Mono via `next/font/local`, from `.woff2`
      files vendored in `src/app/fonts/`. No build-time network dependency
- [x] **Deleted `font-family: Arial, Helvetica, sans-serif` from `globals.css`**
- [x] All colour tokens from Part XI §11.3 as CSS custom properties + `@theme inline`,
      plus `--canvas` for the app shell
- [x] The §11.2 type scale as `--text-*` tokens (`text-h1`, `text-body-lg`, `text-mono`, …)
- [x] Full dark-mode remapping of every token
- [x] `@custom-variant dark (&:where(.dark, .dark *))` — without it Tailwind v4's `dark:`
      variant follows the OS and ignores the `.dark` class entirely
- [x] shadcn/ui installed (20 §11.4 primitives) against our token system.
      ⚠️ `components.json` was hand-written rather than running `init`, which
      rewrites `globals.css` — the file holding the whole §11.3 token set
- [x] `ThemeProvider` sets `.dark` pre-hydration; `EmptyState` and `Skeleton` exist
- [x] `<Can>` permission gate

### 6. Infrastructure (0.7, 0.9, 0.10)

- [x] `docker-compose.yml`: postgres, redis, minio, mailpit
- [x] `.github/workflows/pr.yml` with all six gates
- [x] `src/instrumentation.ts` — `register()` + `onRequestError` wired to the Pino logger
- [ ] OpenTelemetry export — deferred; `OTEL_EXPORTER_OTLP_ENDPOINT` is unset until Phase 7
- [ ] Sentry — deferred to Phase 7 (§12.3); the DSN is empty and a half-wired reporter reads
      as coverage it does not have
- [x] `/api/health` (liveness, touches nothing) and `/api/health/ready` (Postgres fatal,
      Redis and S3 degraded-not-fatal once they land)

## Acceptance criteria

From §12.3, adjusted for the §10.9 structure decision. All must pass before Phase 1 starts.

- [x] ✅ `npm install && npm run dev` boots the web app; `npm run worker` boots the worker
- [x] ✅ A user can sign up and reach `/app` — the whole `(app)` route group exists
- [x] ✅ `npm run verify` passes (lint, typecheck, terminology, test **+ coverage**, build).
      ⚠️ Passes **locally**; no CI run has been observed on GitHub
- [x] ✅ Migrations apply cleanly to a fresh database — verified, 47 tables from empty
- [x] ✅ The tenant-isolation suite runs and passes against real Postgres
- [x] ✅ Health endpoints report dependency status (M1)

### 0.11 — Route groups ✅

All five groups exist with their own layouts and auth postures:

```
src/app/
├── (marketing)/  layout.tsx (SiteHeader + footer), page.tsx, features/, legal/…
├── (auth)/       login/, signup/
├── (app)/        layout.tsx (AppShell + AgencyContext), app/…
├── (onboarding)/ layout.tsx (no shell — the wizard owns the screen)
└── (portal)/     layout.tsx (magic-link session, no ClerkProvider)
```

`(admin)` is Phase 6 and deliberately absent — a route group whose only job is a
`SUPER_ADMIN` gate is worse than nothing if the gate is not yet written.

## What is still open after the close-out

Three items, each blocked on something outside the code:

| # | Item | Blocked on |
|---|---|---|
| 0.6 | Clerk webhook has never seen a real event; the org↔`Agency` sync is unproven | A configured Clerk webhook endpoint pointing at a reachable URL |
| 0.6 | Clerk `<SignIn/>`/`<SignUp/>` still render Clerk defaults, not our tokens | Nothing — a small `appearance` object, deferred as cosmetic |
| 0.9 | CI has never been observed running | A PR against the GitHub remote |

## Traps specific to this phase

- Turbopack is the default builder — no webpack config, use `turbopack.*` keys
- `next lint` is removed; the `eslint` key in `next.config` is removed
- `cookies()`, `headers()`, `params`, `searchParams` are Promises
- `cacheComponents` stays **off** for v1
- Parallel-route slots each need an explicit `default.tsx` or the build fails
- `LayoutProps<'/'>` / `PageProps<'/route'>` are generated into `.next/types`, so `tsc` fails
  on a clean checkout until `next typegen` has run — the root `typecheck` script does it
- Tailwind v4 needs `@custom-variant dark` for class-based dark mode; the `dark:` variant is
  `prefers-color-scheme` by default
- Clerk v7 is Core 3: `<SignedIn>` / `<SignedOut>` are gone, use `<Show when=…>`
