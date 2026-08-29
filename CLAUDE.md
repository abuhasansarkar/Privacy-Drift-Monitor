@AGENTS.md

---

# Claude Code — working notes for this repo

`AGENTS.md` above carries the project rules and is shared with every agent tool. This file
only adds what is specific to working here with Claude Code.

## Reading PLAN.md

`PLAN.md` is ~402 KB, which exceeds the Read tool's 256 KB limit — a bare `Read` on it fails.

1. `Grep` for `^#\{1,3\} ` (or `^# Part`) with `-n` to get a heading index with line numbers.
2. `Read` with `offset` and `limit` for just the part you need.
3. For a question that spans several parts, dispatch an `Explore` subagent over `PLAN.md`
   rather than pulling 100k tokens of plan into the main context.

The part-to-topic map is in `AGENTS.md`. Cite sections as `Part IV §4.12` so they stay
findable after line numbers shift.

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
| `dataviz` | Before writing any chart — health-trend line, tracker donut, drift timeline, admin cost charts. Part XI §11.3 already fixes the palette; keep the two consistent. |
| `artifact-design` | Before publishing any artifact page. |

## Verification expectations

- After UI work, run the app and look at it (`/run` skill) rather than asserting it renders.
- After schema work, generate and inspect the migration; never `db push`.
- After scanner work, assert context count returns to zero on a forced-failure scan — leaked
  Playwright contexts are the most likely way a worker dies in production.
- Report failures with the actual output. A partially-working scan pipeline is reported as
  partial, which is also how the product itself is required to behave.

## Scope discipline

This plan is large and every part is tempting. Build the part that was asked for, at the
depth `PLAN.md` specifies, and flag adjacent gaps in prose instead of silently expanding the
diff. Phases and acceptance criteria are in Part XII.
