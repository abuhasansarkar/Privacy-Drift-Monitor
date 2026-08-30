# Phase 0 — Foundation

> **Goal:** a monorepo where every subsequent phase can be built and shipped safely.
> **Dependencies:** none · **Status:** 🟡 In progress
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

- [x] **npm workspaces** — `"workspaces": ["packages/*"]` in the root `package.json`.
      **Not pnpm.** `pnpm-workspace.yaml` is an inert tombstone; delete it and
      `pnpm-lock.yaml`.
- [x] `packages/config`, `packages/database`, `packages/shared`, `packages/schemas`,
      `packages/scanner` (SSRF guard only — pulled forward from Phase 1 task 1.7)
- [ ] Remaining packages: `ai`, `billing`, `email`, `reports`, `storage`, `ui`
- [x] `packages/config` holds the shared tsconfig presets; every other package extends
      them. `strict: true` everywhere, no exceptions.
- [ ] `worker/` bootstrap — deferred to Phase 2, not needed yet
- [ ] No Turborepo — a single app has nothing to orchestrate. Root scripts call
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
- [ ] **Verify it applies cleanly to a fresh database** — `npm run db:deploy` has not been run
- [x] `client.ts` — single Prisma instance, pooling, query timing
- [x] `tenant.ts` — `forAgency(agencyId)`; this is the enforcement point for tenant isolation
- [x] `testing/factories.ts` — `makeAgency`, `makeWebsite`, `makeScanWithEvidence`
- [x] Seed script + `prisma/seed/trackers.json` (~250 vendors)
- [ ] Seed the **demo agency** with realistic multi-month history — only the three global
      tables (vendors, plans, flags) are seeded today

### 3. Shared foundations (0.4, 0.5)

- [x] `shared/errors.ts` — `AppError` subclasses with **stable machine-readable codes**, plus
      a log-only `reason` option so internal identifiers never reach an exposed message
- [x] `shared/logger.ts` — Pino, structured, redaction paths
- [ ] `shared/rate-limit.ts`, `shared/circuit-breaker.ts`
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
- [ ] Clerk Organizations ↔ `Agency` mapping; **`POST /api/webhooks/clerk` does not exist yet**
- [x] `server/auth/context.ts` — `requireAgencyContext`, `requirePermission`,
      `requireWebsiteAccess`
- [ ] **Re-check authorization inside every Server Action** — the proxy does not reliably
      cover them. No Server Action exists yet; the rule applies from the first one

> ⚠️ **Clerk v7 is Core 3.** `<SignedIn>` / `<SignedOut>` were removed and throw at render
> time. Use `<Show when="signed-in" | "signed-out">`. See the Clerk section in `AGENTS.md`.

### 5. Design system (0.8)

- [ ] Replace the fonts with self-hosted Inter Variable + JetBrains Mono via
      `next/font/local` — currently `next/font/google`, which self-hosts the files at build
      time but keeps a build-time network dependency §11.2 does not want
- [x] **Deleted `font-family: Arial, Helvetica, sans-serif` from `globals.css`**
- [x] All colour tokens from Part XI §11.3 as CSS custom properties + `@theme inline`,
      plus `--canvas` for the app shell
- [x] The §11.2 type scale as `--text-*` tokens (`text-h1`, `text-body-lg`, `text-mono`, …)
- [x] Full dark-mode remapping of every token
- [x] `@custom-variant dark (&:where(.dark, .dark *))` — without it Tailwind v4's `dark:`
      variant follows the OS and ignores the `.dark` class entirely
- [ ] shadcn/ui install + the base component set from §11.4
- [ ] Theme provider (nothing sets the `.dark` class yet), `EmptyState`, `Skeleton` conventions
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

- [ ] `npm install && npm run dev` boots the web app
      *(amended: "web + worker" no longer applies — `worker/` is deferred to Phase 2)*
- [ ] A user can sign up and reach an empty `/app` — **`/app` does not exist yet**, so the
      "Dashboard" link in `SiteHeader` currently 404s for a signed-in user. This is the
      single acceptance criterion furthest from met
- [ ] `npm run verify` passes in CI (lint, typecheck, terminology, test, build)
- [ ] Migrations apply cleanly to a fresh database
- [ ] The tenant-isolation test suite **runs and passes against real Postgres**
      *(amended: the schema is no longer empty, so this is a real assertion, not a trivial one)*
- [ ] Health endpoints report dependency status (M1)

### 0.11 — Route groups 🟡 half done

`SiteHeader` no longer sits in the root layout — the root layout is now minimal and the
public homepage renders its own chrome, so marketing header/footer no longer appear on
`/app`, `/admin` and `/portal`. That was the actual §3.1 breach.

**Remaining, and it needs a file move:**

```bash
mkdir -p "src/app/(marketing)"
git mv src/app/page.tsx "src/app/(marketing)/page.tsx"
# then lift SiteHeader + footer out of the page and into (marketing)/layout.tsx
```

The move cannot be done by creating the new file first: two files both resolving to `/`
is a duplicate-route build error.

```
src/app/
├── (marketing)/  layout.tsx (SiteHeader + footer), page.tsx, pricing/, legal/…
├── (auth)/       login/, signup/            ← already exists
├── (app)/        layout.tsx (AppShell + AgencyContext), app/…
├── (admin)/      layout.tsx (SUPER_ADMIN gate)
└── (portal)/     layout.tsx (magic-link session, no ClerkProvider)
```

Do this **before** any `/app` page is written — retrofitting layouts under 20 existing pages
is materially harder.

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
