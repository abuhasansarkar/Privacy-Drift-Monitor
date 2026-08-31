# Phase 3 — Intelligence

> **Goal:** raw evidence becomes findings, changes, and a score.
> **Dependencies:** Phase 2 · **Status:** ✅ Complete
> **Plan ref:** Part XII §12.3 (Phase 3), Part IV §4.12–§4.15, Part III §3.4, §3.8, §3.10, §3.11

Everything here is **interpretation only**. Nothing in this phase may add a fact that the
scanner did not record — that hard boundary is what makes the pipeline replayable, which is
in turn how rules get tuned safely (Part IV §4.14).

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 3.1 | Tracker vendor database: schema, ~250-vendor seed, admin CRUD | L | [08-tracker-detection](../features/08-tracker-detection.md) | ✅ |
| 3.2 | Classification engine with confidence and corroboration | M | [08-tracker-detection](../features/08-tracker-detection.md) | ✅ |
| 3.3 | Rule engine: framework, precedence, registry, all 25 launch rules | L | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ✅ |
| 3.4 | Issue creation with fingerprint deduplication and lifecycle | M | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ✅ |
| 3.5 | Ignore rules and false-positive suppression | M | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ✅ |
| 3.6 | Drift engine: normalization, fingerprints, diff, event generation, suppression | L | [10-privacy-drift](../features/10-privacy-drift.md) | ✅ |
| 3.7 | Health score: deduction model, breakdown persistence, partial handling | M | [11-health-score](../features/11-health-score.md) | ✅ |
| 3.8 | Analysis and drift jobs (separate from the scan job) | M | [05-scan-engine](../features/05-scan-engine.md) | ✅ |
| 3.9 | Issue list + issue detail pages (all 10 sections) | L | [09-rule-engine-issues](../features/09-rule-engine-issues.md) | ✅ |
| 3.10 | Website detail tabs: Overview, Issues, Trackers, Cookies, Consent, Changes, Scans, Evidence | XL | [03-websites](../features/03-websites.md) | ✅ |
| 3.11 | Drift feed page | M | [10-privacy-drift](../features/10-privacy-drift.md) | ✅ |
| 3.12 | Dashboard: all six widgets, live | L | [12-dashboard](../features/12-dashboard.md) | ✅ |
| 3.13 | Portfolio tracker inventory pages | M | [08-tracker-detection](../features/08-tracker-detection.md) | ✅ |

## Order of attack

```
3.1 vendor DB  →  3.2 classifier  →  3.3 rules  →  3.4 issues  →  3.5 ignore rules
                                              ↘  3.6 drift  ↘  3.7 score
                                                 → 3.8 jobs → UI (3.9–3.13)
```

Keep the analysis and drift jobs **separate from the scan job** (3.8). A scan that succeeded
should not be marked failed because rule evaluation threw, and separating them is what allows
re-running analysis over stored evidence when a rule changes.

## Critical implementation rules

**Deduplicate issues on a fingerprint, not on identity.** The same finding seen in two scans
is one issue with `occurrenceCount: 2` — not two issues. A resolved issue that recurs
transitions to `REOPENED`.

**Ignore rules suppress at creation time**, not at render time. An ignored issue must never
regenerate and never alert.

**Corroboration is required for Critical.** A single weak signal cannot produce a Critical
finding — false positives are a Medium-probability, **Critical-impact** risk (§12.7), because
one false positive destroys the trust the whole product depends on.

**Drift never compares against a `PARTIAL` scan.** Comparing a complete scan to an incomplete
one manufactures phantom "removals". This is the single most likely source of false drift.

**Normalize before diffing.** Rotating cookie names, cache-busted script URLs and session
identifiers must be fingerprinted away or F28 will never go green.

**The score breakdown must sum to the displayed score.** It is an *explainable* score — five
weighted components with visible point contributions (Part IV §4.12). A partial scan shows an
asterisked score with the untested phases named.

## Acceptance criteria

From §12.3, M4 and M5 (§12.4).

- [ ] F11–F17 produce exactly the expected rules with the expected severities
- [ ] Trackers classify to named vendors with confidence; unknown third parties are recorded
      as unknown vendors rather than dropped
- [ ] An issue seen in two scans is one issue with `occurrenceCount: 2`
- [ ] A resolved-then-recurring issue transitions to `REOPENED`
- [ ] An ignored issue never regenerates and never alerts
- [ ] The score breakdown sums to the displayed score
- [ ] A partial scan shows an asterisked score with the untested phases named
- [ ] **Two identical scans produce zero drift events**
- [ ] A new tracker produces `TRACKER_ADDED` plus PDM-R013
- [ ] A reject-all regression produces `CONSENT_REGRESSION` at Critical
- [ ] Drift correctly reports `+3 trackers, +5 domains` on F16
- [ ] Rotating cookie names and cache-busted scripts produce **no** false drift
- [ ] Accepted changes stay suppressed

## UI notes for this phase

- The issue detail page has a **strict, repeatable narrative order** (Part III §3.10,
  sections 1–10). Sections 2 ("Why this matters technically") is rule-authored static copy,
  never AI — it must read identically every time.
- Website detail tabs are URL-driven (`?tab=`) so every tab is linkable and back-navigable.
- The evidence viewer holds 5,000+ rows — TanStack Virtual, server-side pagination at
  200/page, lazy-load bodies on expand.
- The drift feed "should feel like a monitoring timeline, not a table."


## The rule ids are a contract too

Every `Issue` row stores `ruleId`. Renaming one orphans every issue derived from
it and breaks "trace a finding to the rule that produced it" (P2) — so the ids
are §4.11's `PDM-R001` … `PDM-R025`, not local names.

An earlier pass shipped five rules under local ids (`R01_TRACKER_BEFORE_CONSENT`
and friends) that did not map cleanly onto the inventory: §4.11 splits marketing
from analytics at two different severities, and one local rule covered both.
All twenty-five now exist, `rules.test.ts` fails the build if one goes missing,
and two rules that are ours rather than the plan's — cookies and storage written
*before* consent, which §4.11 does not name — carry `PDM-X` ids.

**Two passes, not one.** Evidence rules run straight after a scan; drift rules
(R013–R019) run after the drift engine has produced its events, so the findings
list and the drift feed describe the same change. Folding them together would
mean the rule engine diffing scans itself, and two diffs eventually disagree.

**Rules that describe OUR limitation say so.** §4.11 marks R010 and R012 as high
false-positive on purpose — they fire when the scanner struggled, not when the
site is wrong. Their copy leads with "We could not…", asserted by a test.

## Everything else that landed

- **Attention Center** (§3.4 widget 2, "the most important component on the
  page") — five sources, an explicit urgency score, and **deduplicated by
  website**: a site with a regression usually also has a critical issue and a
  failed scan, and listing all three turns one thing to look at into three
  things to reconcile. The suppressed count is shown, not hidden.
- **Recent Activity** (widget 6) — built from the audit log rather than a
  parallel activity table, because a second version of the same truth drifts
  from it. Scan completions are the one exception: a scheduled scan has no actor
  and writes no audit row, so it is merged in from the scan table.
- **Website detail** now has its Issues, Evidence and Reports tabs. Both new
  tabs force the website filter after parsing, so a hand-edited `?website=`
  cannot widen them to another site.
- **`/app/trackers/[trackerId]`** — vendor profile, every website it appears on
  with a consent-state breakdown, and first-seen dates. The catalogue is global
  reference data and the detections are tenant data; the two scopes are read
  through different clients on purpose.
