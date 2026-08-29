# Feature 11 — Privacy Health Score

> **Phase:** 3 · **Priority:** P1 · **Effort:** M · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part IV §4.12 (score model), Part XI §11.3 (score bands)

## What it is

An explainable 0–100 score per website, built from a **deduction model** over five weighted
components, with the breakdown persisted so the number can always be justified.

## Why it exists

Persona A needs one number to scan 80 sites with. Persona D (the client) needs something
comprehensible in the portal. But an unexplainable score is worse than none — hence the
breakdown requirement.

## Dependencies

Features 09 (rules), 10 (drift). Blocks: 12 (dashboard), 14 (reports), 15 (portal).

## Public interface

```ts
computeScore(input): ScoreResult   // scoring/score.ts
```

## Score bands (Part XI §11.3)

| Band | Range | Token |
|---|---|---|
| Excellent | 90–100 | `--score-excellent` #16A34A |
| Good | 75–89 | `--score-good` #65A30D |
| Fair | 50–74 | `--score-fair` #CA8A04 |
| Poor | 25–49 | `--score-poor` #EA580C |
| Critical | 0–24 | `--score-critical` #B91C1C |

## Build steps

- [ ] Deduction model over the five weighted components (Part IV §4.12)
- [ ] Persist the **breakdown**, not just the total
- [ ] Partial-scan handling — see below
- [ ] `ScoreGauge` and `ScoreBreakdown` components
- [ ] Score delta vs. previous scan on the website header
- [ ] 30-day sparkline on the website Overview tab
- [ ] Portfolio average + 30/60/90-day trend chart on the dashboard, with drift events as
      annotation markers
- [ ] Plain-language interpretation for the client portal (no numeric comparison to other clients)
- [ ] `SCORING_ENGINE_V2` feature flag wired for **shadow-mode rollout** — compute both,
      store both, compare, then flip

## The two non-negotiables

**1. The breakdown must sum to the displayed score.** If it doesn't, the score is not
explainable and the product's central claim ("evidence, not opinion") is undermined on the
most visible number in the UI.

**2. A partial scan shows an asterisked score with the untested phases named.** Never a clean
number from an incomplete scan. This is principle P6 applied to scoring.

## Acceptance criteria

- [ ] The score breakdown sums to the displayed score
- [ ] A partial scan shows an asterisked score with the untested phases named
- [ ] Score bands map to the correct colour tokens
- [ ] Delta vs. previous scan is correct, including across a `PARTIAL` gap
- [ ] The portal shows plain-language interpretation, not a bare number
- [ ] Shadow mode can compute V2 alongside V1 without changing displayed output

## Tests required

| Level | What |
|---|---|
| Unit | Deduction model; breakdown summation; partial handling; band boundaries (89/90, 74/75, …) |
| Integration | Breakdown persistence and retrieval |

## Traps

- Boundary values are where scoring bugs hide. Test 24/25, 49/50, 74/75, 89/90 explicitly.
- A website with no completed scan has **no score**, not a score of 0. Rendering 0 would
  read as "catastrophically bad" when it means "not yet measured".
- Part XII §12.9 Q6: the score **is** visible in the client portal by default, with plain
  language and no cross-client comparison — but agencies can disable it per client if a low
  score would be awkward. Build the toggle.
- Never label a band with pass/fail language. "Fair" not "Failing"; "Excellent" not "Compliant".
