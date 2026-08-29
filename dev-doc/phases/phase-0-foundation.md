# Phase 0 — Foundation

> **Goal:** a monorepo where every subsequent phase can be built and shipped safely.
> **Dependencies:** none · **Status:** ⬜ Not started
> **Plan ref:** Part XII §12.3 (Phase 0), §12.1 (repo structure), Part V (schema), Part XI (tokens)

This phase ships no user-visible feature. Its output is the ability to build everything else
without re-architecting. Do not shortcut it — Part 0 §0.2 P4 is explicit that the scan
pipeline, tenancy model and evidence schema are built once, correctly.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 0.1 | ~~Convert to a pnpm + Turborepo monorepo; move `src/` → `apps/web/src/`~~ **CHANGED — see below** | S | — | ⏭️ |
| 0.2 | Create `packages/*` with shared tsconfig/eslint presets, strict mode everywhere | S | — | 🟡 |
| 0.3 | `packages/database`: Prisma init, full schema, first migration, seed script | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ⬜ |
| 0.4 | `packages/shared`: error taxonomy, Pino logger, rate limiter, circuit breaker, permissions, copy module | M | [22-observability-ops](../features/22-observability-ops.md) | ⬜ |
| 0.5 | `packages/schemas`: base Zod schemas and shared enums | S | — | ⬜ |
| 0.6 | Clerk integration: `proxy.ts`, `requireAgencyContext`, webhook sync, login/signup routes | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ⬜ |
| 0.7 | `docker-compose.yml` — postgres, redis, minio, mailpit | S | — | ⬜ |
| 0.8 | Design system: Tailwind v4 tokens, shadcn install, base components, theme provider, dark mode | M | [21-design-system](../features/21-design-system.md) | ⬜ |
| 0.9 | CI: PR workflow — lint, typecheck, test, build, secret scan, migration check | M | — | ⬜ |
| 0.10 | `instrumentation.ts`, structured logging, Sentry, `/api/health` + `/api/health/ready` | S | [22-observability-ops](../features/22-observability-ops.md) | ⬜ |

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

- [x] `pnpm-workspace.yaml` declaring `packages/*` only
- [ ] Create `packages/`: `database`, `scanner`, `ai`, `billing`, `email`, `reports`,
      `storage`, `schemas`, `shared`, `ui`, `config`
- [ ] `packages/config` holds the shared eslint / tsconfig presets; every other package
      extends them. `strict: true` everywhere, no exceptions.
- [ ] `worker/` bootstrap — deferred to Phase 2, not needed yet
- [ ] No Turborepo — a single package has nothing to orchestrate. Root scripts call
      `pnpm --filter @pdm/database …` directly.

> ⚠️ Do **not** add a `webpack` key to `next.config.ts` — Turbopack is the default for both
> `next dev` and `next build` in Next 16, and a webpack config makes the build fail.

### 2. Database (0.3)

- [ ] Read **Part V** in full before writing the schema. Do not draft models from memory.
- [ ] `packages/database/prisma/schema.prisma` — all models, all foreign keys declared
- [ ] All indexes from Part V §5.3 — they are designed up front deliberately, because the
      database is a named bottleneck risk (§12.7)
- [ ] First migration; verify it applies cleanly to a **fresh** database
- [ ] `client.ts` — single Prisma instance, pooling, query timing middleware
- [ ] `tenant.ts` — `forAgency(agencyId)`; this is the enforcement point for tenant isolation
- [ ] `testing/factories.ts` — `makeAgency`, `makeWebsite`, `makeScanWithEvidence`
- [ ] Seed script, including the demo agency with realistic multi-month history

### 3. Shared foundations (0.4, 0.5)

- [ ] `shared/errors.ts` — `AppError` subclasses with **stable machine-readable codes**
- [ ] `shared/logger.ts` — Pino, structured, request-correlated
- [ ] `shared/rate-limit.ts`, `shared/circuit-breaker.ts`
- [ ] `shared/permissions.ts` — the RBAC matrix, shared by UI and server, `can(role, permission)`
- [ ] `shared/copy/terminology.ts` — approved phrases + the forbidden list (Part I §1.12)
- [ ] `scripts/check-terminology.ts` — CI check greping `apps/`, `packages/`, `emails/`
- [ ] `packages/schemas` — base Zod schemas, shared enums

### 4. Auth (0.6)

- [ ] `apps/web/src/proxy.ts` — **not** `middleware.ts`; Node runtime only, and setting
      `runtime` inside it throws
- [ ] Clerk `<SignIn/>` / `<SignUp/>` at catch-all routes `(auth)/login/[[...rest]]` and
      `(auth)/signup/[[...rest]]`, styled via the `appearance` object to match our tokens
- [ ] Clerk Organizations ↔ `Agency` mapping; webhook sync
- [ ] `server/auth/context.ts` — `requireAgencyContext`, `requirePermission`
- [ ] **Re-check authorization inside every Server Action** — the proxy does not reliably
      cover them

### 5. Design system (0.8)

- [ ] Replace Geist with self-hosted Inter Variable + JetBrains Mono via `next/font/local`
- [ ] **Delete `font-family: Arial, Helvetica, sans-serif` from `globals.css`** — it
      overrides the font variable (Part XI §11.2)
- [ ] All colour tokens from Part XI §11.3 as CSS custom properties + `@theme inline`
- [ ] Full dark-mode remapping of every token
- [ ] shadcn/ui install + the base component set from §11.4
- [ ] Theme provider, `<Can>` permission gate, `EmptyState`, `Skeleton` conventions

### 6. Infrastructure (0.7, 0.9, 0.10)

- [ ] `docker-compose.yml`: postgres, redis, minio, mailpit
- [ ] `.github/workflows/pr.yml` with all six gates
- [ ] `instrumentation.ts` — OpenTelemetry + `onRequestError`
- [ ] Sentry; `/api/health` and `/api/health/ready` reporting dependency status

## Acceptance criteria

From §12.3. All must pass before Phase 1 starts.

- [ ] `pnpm install && pnpm dev` boots web + worker
- [ ] A user can sign up and reach an empty `/app`
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass in CI
- [ ] Migrations apply cleanly to a fresh database
- [ ] The tenant-isolation test suite exists and passes — trivially with zero models, but the
      harness is in place
- [ ] Health endpoints report dependency status (M1)

## Traps specific to this phase

- Turbopack is the default builder — no webpack config, use `turbopack.*` keys
- `next lint` is removed; the `eslint` key in `next.config` is removed
- `cookies()`, `headers()`, `params`, `searchParams` are Promises
- `cacheComponents` stays **off** for v1
- Parallel-route slots each need an explicit `default.tsx` or the build fails
