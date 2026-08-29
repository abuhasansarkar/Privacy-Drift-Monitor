# Feature 09 — Rule Engine & Issues

> **Phase:** 3 (+ verification re-scan in Phase 4) · **Priority:** P0 · **Effort:** L + M + M · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part IV (rules, §4.14 replay), Part VI §6.5 (lifecycle), Part III §3.10

## What it is

The deterministic rule engine (~25 launch rules), issue creation with fingerprint
deduplication, the issue lifecycle, ignore rules / false-positive suppression, and the
verification re-scan loop.

## Why it exists

Findings must be **reproducible and workable**, not just listed. And one false positive
destroys trust in everything — a Medium-probability, **Critical-impact** risk.

## Dependencies

Features 07 (evidence), 08 (trackers). Blocks: 10, 11, 13, 14, 16.

## Public interface

```ts
evaluateRules(ctx): Finding[]   // rules/registry.ts
```

## Build steps

### Rule engine
- [ ] Framework + precedence + registry
- [ ] All 25 launch rules with stable IDs (`PDM-R###`) — read Part IV for the full set
- [ ] Confidence thresholds **by severity**; corroboration required for Critical
- [ ] An `UNVERIFIED` state for low-confidence findings
- [ ] Per-rule false-positive tracking (feeds `/admin/issues` rule analytics)
- [ ] **Replay capability** — re-run rules over stored evidence and diff the output. This is
      how rules are tuned safely (§4.14) and it only works because of the evidence boundary

### Issues
- [ ] Fingerprint-based deduplication: the same finding across scans is **one issue with
      `occurrenceCount: n`**
- [ ] Lifecycle state machine (Part VI §6.5) incl. `REOPENED` on recurrence and `VERIFIED`
      after a successful verification re-scan
- [ ] Assignment, acknowledge, resolve, reopen
- [ ] **Ignore rules suppress at creation time**, not render time — an ignored issue never
      regenerates and never alerts. Ignoring is Manager+ **with a mandatory reason**
- [ ] Cross-portfolio queue `/app/issues` with saved views stored per user in `UserPreference`
- [ ] Bulk: acknowledge, assign, ignore, resolve, generate report
- [ ] Verification re-scan workflow (Phase 4)

### Issue detail page — strict narrative order

Part III §3.10 fixes ten sections in a fixed order. Two rules people break:

- **Section 2 "Why this matters technically" is static rule-authored copy, never AI** — it
  must read identically every time.
- Section 3 "Evidence" links straight into the full evidence viewer; the claim and the proof
  are never more than one click apart.

Sections 7 (AI explanation) and 8 (recommended action) are feature 16 and render only if
available — the page is complete without them.

## Acceptance criteria

- [ ] F11–F17 produce exactly the expected rules with the expected severities
- [ ] An issue seen in two scans is one issue with `occurrenceCount: 2`
- [ ] A resolved-then-recurring issue transitions to `REOPENED`
- [ ] An ignored issue never regenerates and never alerts
- [ ] Ignoring requires a reason and is audit-logged
- [ ] A resolved issue re-scans and transitions to `VERIFIED`
- [ ] Rule evaluation is replayable — identical evidence produces identical findings
- [ ] A rule can be retired or downgraded **via feature flag without a deploy**

## Tests required

| Level | What |
|---|---|
| Unit | Every rule against its fixture; precedence; confidence thresholds; state machine |
| Fixtures | F11–F17 |
| Integration | Deduplication across consecutive scans; ignore-rule suppression at creation |
| E2E | Issue triage → resolve → verify |

## Failure-mode: false positives

This is the risk that kills the product quietly. Controls, all of which must actually ship:

| Control | Status |
|---|---|
| Confidence thresholds by severity | ⬜ |
| Corroboration required for Critical | ⬜ |
| `UNVERIFIED` state | ⬜ |
| Ignore rules | ⬜ |
| Per-rule FP tracking | ⬜ |
| Replay-based rule tuning | ⬜ |
| **Fallback:** retire/downgrade a rule via feature flag | ⬜ |

## Traps

- Empty state must name the recency: *"No potential privacy issues detected in the latest
  scan, completed 3 hours ago"* — so the emptiness reads as fresh, not stale.
- Terminology: *potential issue*, never *violation*. This page is the most likely place for
  banned language to leak in.
