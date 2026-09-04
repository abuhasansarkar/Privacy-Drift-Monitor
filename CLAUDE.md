@AGENTS.md

---

# Claude Code — working notes for this repo

`AGENTS.md` above carries the project rules and is shared with every agent tool. This file
only adds what is specific to working here with Claude Code.

## Where the plan lives

**`PLAN.md` no longer exists.** It was deleted in `6f6059c`, along with `PLAN-V2.md`,
`PLAN-V3.md`, `UI_Func.md` and the `dev-doc*/` trees, and it is not coming back.

- **`NEW-PLAN.md`** — current state, gap register (`G-01`…`G-12`) and roadmap.
- **`dev-doc/`** — one small file per task, with acceptance criteria you can run.
  Start at `dev-doc/README.md`.
- **`OVERVIEW.md`** — the 2026-09-03 audit. Historical record, not a forward plan.

⚠️ **Source comments cite `PLAN.md §x.y` about 1,700 times. Those references cannot be
resolved and must not be trusted.** The deleted `PLAN.md` had 41 sections; 1,315 of the
citations named a section it never contained, and where the numbers did collide the topics
did not — code cites `§7.1` for BullMQ queues while `§7.1` was "Consent State Machine".
The file in the repo was never the document the code was written against. Treat a `§`
citation as a hint about intent, never as an authority, and do not add new ones.

## Before writing framework code

The scaffold is Next.js 16.3.3, which breaks a lot of widely-known Next 13–15 patterns.
Check `node_modules/next/dist/docs/` for the relevant guide, and check the trap list in
`AGENTS.md` — `proxy.ts` instead of `middleware.ts`, awaited `params`/`cookies`/`headers`,
Turbopack-only builds, two-argument `revalidateTag`. Do not rely on memory for these.

## Useful skills here

| Skill | When |
|---|---|
| `/security-review` | Any change touching the SSRF guard, tenant scoping, the free public scanner, portal auth, or evidence redaction. This product accepts arbitrary URLs from anonymous users and drives a browser at them — that surface deserves a review every time it moves. |
| `/code-review` | Before merging any scanner, rule-engine or billing change. |
| `dataviz` | Before writing any chart — health-trend line, tracker donut, drift timeline, admin cost charts. The palette is fixed by the design tokens in `src/app/globals.css`; keep the two consistent. |
| `artifact-design` | Before publishing any artifact page. |

## Package manager

**npm with npm workspaces.** Never suggest or run `pnpm` or `yarn` commands here, and never
write `"workspace:*"` in a package.json — npm does not understand that protocol and will try
the registry. Local packages depend on each other with `"*"`.

## Verification expectations

- After UI work, run the app and look at it (`/run` skill) rather than asserting it renders.
- After schema work, generate and inspect the migration; never `db push`.
- After scanner work, assert context count returns to zero on a forced-failure scan — leaked
  Playwright contexts are the most likely way a worker dies in production.
- Report failures with the actual output. A partially-working scan pipeline is reported as
  partial, which is also how the product itself is required to behave.

## Scope discipline

Build the task that was asked for, at the depth its `dev-doc/tasks/` file specifies, and
flag adjacent gaps in prose instead of silently expanding the diff. Phases and acceptance
criteria are in `NEW-PLAN.md` §6; per-task acceptance is in `dev-doc/tasks/`.

## Reporting

A task is `DONE` only when its acceptance was **run** and the evidence is written into its
`dev-doc/tasks/` file. Code that exists and typechecks is `BUILT`, not `DONE`. This
distinction is the one the repo has broken before, in the direction that costs most.
