# Feature 10 — Privacy Drift

> **Phase:** 3 · **Priority:** P0 · **Effort:** L + M · **Value:** 5
> **Status:** ⬜ Not started
> **🎯 The core differentiator. This is the product's name.**
> **Plan refs:** Part IV §4.x (drift engine), Part III §3.8 (Changes tab), §3.11 (drift feed)

## What it is

Scan-to-scan diffing that produces drift events: trackers added or removed, third-party
domains changed, cookies changed, consent regressions. Plus the drift feed — the product's
signature view.

## Why it exists

Differentiator #1: *"A snapshot tells you today. Drift tells you what changed."* Competitors
run a scan and grade you. A site that was fine in January and broke in March is the actual
problem agencies have — and it's also moat component #1, because historical data cannot be
back-filled by a competitor.

## Dependencies

Features 07, 08, 09. Blocks: 12 (dashboard drift widget), 13 (drift alerts), 16 (AI drift
summary).

## Public interface

```ts
buildFingerprints(...)   // drift/normalize.ts
computeDrift(...)        // drift/diff.ts
```

## Build steps

- [ ] **Normalization** — fingerprint away rotating cookie names, cache-busted script URLs,
      session identifiers, and anything else that changes every load
- [ ] Fingerprint construction per artifact class
- [ ] Set-diff between the current scan and the previous **complete** scan
- [ ] Drift event generation with change types (`TRACKER_ADDED`, `CONSENT_REGRESSION`, etc.)
      and severity
- [ ] Suppression: accepted changes stay suppressed
- [ ] Drift job, separate from the scan and analysis jobs
- [ ] Website detail → Changes tab: timeline, before/after mini-tables, compare-any-two-scans
- [ ] `/app/drift` portfolio feed: day grouping with day-level rollups
      (*"March 14 — 4 websites changed"*)
- [ ] Dashboard drift summary widget (feature 12)

## The two rules that decide whether this works

**1. Drift never compares against a `PARTIAL` scan.** Comparing a complete scan to an
incomplete one manufactures phantom removals — "5 trackers disappeared" when really the phase
didn't run. This is the single most likely source of false drift.

**2. Normalize before diffing.** If cookie name `_sess_a1b2c3` becomes `_sess_d4e5f6` on every
load, a naive diff reports a change on every single scan and the feature becomes noise the
user mutes. **F28 — zero drift events on two identical consecutive scans — is a hard CI
gate** precisely because this failure is silent and gradual.

## Acceptance criteria

- [ ] **Two identical scans produce zero drift events** (F28, hard gate)
- [ ] A new tracker produces `TRACKER_ADDED` **plus** rule PDM-R013
- [ ] A reject-all regression produces `CONSENT_REGRESSION` at Critical
- [ ] Drift correctly reports `+3 trackers, +5 domains` on F16
- [ ] Drift never compares against a `PARTIAL` scan
- [ ] Rotating cookie names and cache-busted scripts produce no false drift
- [ ] Accepted changes stay suppressed
- [ ] The feed groups by day with correct day-level rollups

## Tests required

| Level | What |
|---|---|
| Unit | Normalization + fingerprinting against rotating/cache-busted inputs |
| Unit | Set-diff correctness |
| Fixtures | F16 (expected counts), **F28 (zero spurious drift — hard gate)** |
| Integration | Partial-scan exclusion from comparison |

## UI note

Part III §3.11 is explicit: the drift feed *"should feel like a monitoring timeline, not a
table."* Vertical rail, day headers, event cards with before → after inline diffs. This is the
view that gets screenshotted for marketing (see `UI_DESIGN_PROMPTS.md` §5.14 and §4.2), so it
carries more design weight than a list page normally would.

## Traps

- The first scan of a website has nothing to compare against — that is not "no drift", it is
  "no baseline". The empty state says: *"No changes detected since monitoring began. We'll
  tell you the moment something changes."*
- A website paused for two months and resumed will diff against a two-month-old scan. Decide
  and document whether that is desirable (it usually is — it's still a real change) and make
  the timestamps visible so the user isn't surprised.
- Drift severity and issue severity are related but not identical; a drift event may or may
  not create an issue.
