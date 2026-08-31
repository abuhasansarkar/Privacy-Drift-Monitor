# Development Workflow

How work moves from a task in a phase doc to merged, verified code.

## The loop

```
Pick a task from the current phase doc
  → open the feature doc it points to
  → read the PLAN.md sections that feature doc references
  → branch
  → build (schema → server → API → UI, in that order)
  → test at the levels PLAN.md §12.2 requires for that layer
  → self-review against the feature's acceptance criteria
  → PR → CI gates → merge
  → tick the checkbox in the phase doc and the feature doc
```

**Never skip the read step.** The plan already decided most of what you are about to decide.
Re-deciding it produces divergence that costs more to reconcile than the reading cost.

## Build order inside a feature

Consistent ordering prevents rework:

1. **Prisma schema + migration** — the shape of the data first (Part V)
2. **Zod schemas** in `packages/schemas` — the contract
3. **Repository** in `packages/database/src/repositories` — the only place raw Prisma is used
4. **Service** in `src/server/services` — orchestration, the only caller of repositories
   (no `apps/web/` prefix — that directory does not exist, see PLAN.md §10.9)
5. **API route or Server Action** — validation, authz, error boundary
6. **UI** — components render; they never contain business logic
7. **Tests** at each level as you go, not at the end

## Branching and commits

- Branch from `main`: `phase-N/short-description` or `feat/short-description`.
- Small, reviewable PRs. A PR that touches the scanner *and* billing is two PRs.
- Commit the `nextjs-agent-rules` block if `next dev` re-adds it — deleting it only dirties
  the tree (see `AGENTS.md`).
- Do not commit or push unless asked.

## CI gates (PR workflow)

From §12.3 Phase 0. Every one of these must pass before merge:

- [ ] `lint` — eslint flat config (`next lint` no longer exists)
- [ ] `typecheck` — TypeScript strict. Runs `next typegen` first: `LayoutProps` /
      `PageProps` live in `.next/types` and do not exist on a clean checkout
- [ ] `test` — unit + integration
- [ ] `build` — Turbopack production build
- [ ] secret scan
- [ ] migration check — migrations apply cleanly to a fresh database
- [ ] terminology check — `scripts/check-terminology.ts` greps for the banned list

**Coverage gate:** ≥ 85% on `packages/scanner` and `packages/billing`. These two are where a
silent defect is most expensive — one produces false findings, the other produces wrong
charges.

⚠️ `vitest.config.ts` currently enforces the threshold on `packages/scanner` only. A coverage
threshold whose glob matches nothing makes vitest fail the run, so `packages/billing` is
added to `thresholds` **in the PR that creates the package** (Phase 6), not before.

⚠️ **THE GATE IS RUN BY `npm run test:coverage`, AND BOTH CI AND `verify` CALL IT.** For four
phases they did not: CI ran `npm test` and `verify` ran `npm run test` — neither computes
coverage, so the threshold in `vitest.config.ts` was never evaluated by anything. The first
time it was actually executed it FAILED, at 82.62%. If you change one of these two call
sites, change the other: a local `verify` that passes where CI fails is how a gate stops
being believed.

## Testing ladder

Full detail in Part XII §12.2. What runs when:

| Layer | Tool | When |
|---|---|---|
| Unit | Vitest | Every PR |
| Integration (testcontainers: Postgres, MinIO) | Vitest | Every PR |
| Scanner fixtures F01–F30 | Vitest + Playwright + fixture server | Every PR touching `packages/scanner` — **F28 is a hard gate** |
| AI validators (`MockProvider`) | Vitest | Every PR touching `packages/ai` |
| E2E | Playwright | Nightly + pre-release |
| Load | k6 | Pre-release |
| Security | Manual + automated | Pre-release + quarterly |

Use the typed factories in `packages/database/src/testing/factories.ts` (`makeAgency`,
`makeWebsite`, `makeScanWithEvidence`). Never hand-build fixtures.

## Definition of done

A task is done when **all** of these hold:

- [ ] It matches the `PLAN.md` section that specifies it
- [ ] Every input is Zod-validated before business logic runs
- [ ] Every tenant resource is `agencyId`-scoped, and a test proves a second agency can't read it
- [ ] Loading, empty, error and **partial** states all exist and are designed
- [ ] No banned terminology in any user-visible string
- [ ] Tests at the required levels pass
- [ ] `lint`, `typecheck`, `build` pass
- [ ] Any new user-facing claim traces to recorded evidence
- [ ] The checkbox is ticked in the phase doc **and** the feature doc

## Non-negotiables that reviewers must check

Reviewers should reject a PR that:

- Lets an LLM establish a fact the scanner is responsible for
- Adds an AI output path without schema, grounding, terminology and claim validation
- Queries a tenant model without `agencyId` scoping
- Renders a clean verdict from a `PARTIAL` scan
- Navigates or redirects without passing through the SSRF guard
- Adds `tailwind.config.js` or a `webpack` key to `next.config.ts`
- Conveys severity by colour alone
- Puts business logic in a React component
- Adds a tenant model to `schema.prisma` without adding it to `TENANT_MODELS`
- Puts an internal identifier (a permission name, a resource id) in an
  `expose: true` error message instead of the log-only `reason` option
- Hardcodes a user-facing string in JSX instead of adding it to
  `packages/shared/src/copy/en.ts` and reading it through `t()`

## Environment

**Package manager: npm**, using npm workspaces. There is no pnpm and no Turborepo
(PLAN.md §10.9).

⚠️ `pnpm-workspace.yaml` and `pnpm-lock.yaml` are **deleted**. They were left in place as
"inert tombstones" for four phases and they were not inert: the `shadcn` CLI detects a
package manager by looking for a lockfile, found pnpm's, and ran `pnpm install` against an
npm workspace — rewriting `pnpm-lock.yaml`, creating `node_modules/.pnpm`, and installing
nothing npm could see. If you ever reintroduce one of those files, this happens again.

```bash
docker compose up -d      # postgres, redis, minio, mailpit
npm install
npm run db:generate       # required before typecheck — Prisma emits the types
npm run db:migrate        # applies migrations to your local database
npm run db:seed           # global tables: vendors, plans, flags
npm run db:seed:demo -- --list                 # which agencies you could seed into
npm run db:seed:demo -- --agency <your-slug>   # 12 weeks of history in YOUR agency
npm run dev               # web
npm run worker            # the scan/analysis/report/ai worker
npm run verify            # lint → typecheck → terminology → test+coverage → build
```

⚠️ `db:seed:demo` writes **fabricated tenant data** (agencies, findings, evidence) and is
deliberately a separate script from `db:seed`, which only touches global tables and runs
after every migration. It refuses to run unless `DATABASE_URL` points at localhost.

⚠️ **PASS `--agency <slug>`, or you will not see the data.** Without it the script builds a
standalone demo agency — which tenant isolation (P4) correctly hides from the agency your
Clerk account belongs to, so every page renders its empty state and the seed looks broken
while working exactly as designed. `--list` prints the slugs. In `--agency` mode it never
deletes the agency: it removes only the rows it created, matched by the reserved `.test`
hosts, so it is safe to run beside real data.

## The test database

⚠️ **Tests run against `<your-db>_test`, created and migrated automatically by
`test/global-setup.ts`.** They used to run against the development database, and
`resetDatabase()` does a `TRUNCATE … CASCADE` — so this sequence silently destroyed a
morning's demo data:

```bash
npm run db:seed:demo      # twelve weeks of history
npm test                  # …truncates all of it
npm run dev               # every page renders its empty state
```

Nothing failed and nothing warned; an empty `/app/drift` was indistinguishable from a
broken query. If you add a test that needs a database, it gets the test one for free — do
not point anything at `DATABASE_URL` directly.

Workspace-scoped commands use `-w`:

```bash
npm run typecheck -w @pdm/database
npm install zod -w @pdm/schemas
npm run typecheck --workspaces --if-present   # every package
```

⚠️ `npm ci` (used by CI) requires `package-lock.json` to match `package.json`. After
adding a dependency or a workspace, run `npm install` and **commit the updated lockfile**
or the PR workflow fails at the install step.

Environment variables: `.env.example` is the canonical list (Part X §10.10). Two that cause
non-obvious production failures:

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be **pinned and identical across all web containers**
- `WORKER_ROLES` selects which queues a worker container consumes

## Handling uncertainty

If the plan does not answer a question:

1. Check Part XII §12.9 — it lists open questions **with default decisions** so work is never blocked.
2. Check Part XII §12.8 — if you are relying on an assumption, say so in the PR.
3. If still unresolved, implement the smallest reversible option and flag it in the PR
   description. Do not silently invent architecture.
