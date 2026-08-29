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
4. **Service** in `apps/web/src/server/services` — orchestration, the only caller of repositories
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
- [ ] `typecheck` — TypeScript strict
- [ ] `test` — unit + integration
- [ ] `build` — Turbopack production build
- [ ] secret scan
- [ ] migration check — migrations apply cleanly to a fresh database
- [ ] terminology check — `scripts/check-terminology.ts` greps for the banned list

**Coverage gate:** ≥ 85% on `packages/scanner` and `packages/billing`. These two are where a
silent defect is most expensive — one produces false findings, the other produces wrong
charges.

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

## Environment

```bash
docker compose up -d      # postgres, redis, minio, mailpit
pnpm install
pnpm dev                  # web + worker
pnpm test / lint / typecheck / build
```

> Until Phase 0 converts the scaffold to a pnpm + Turborepo monorepo, the commands are the
> scaffold's npm scripts: `npm run dev | build | start | lint`.

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
