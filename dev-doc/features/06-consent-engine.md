# Feature 06 — Consent Engine

> **Phase:** 2 · **Priority:** P0 · **Effort:** XL · **Value:** 5
> **Status:** ⬜ Not started
> **⚠️ Highest-probability, highest-impact risk in the register (§12.7).**
> **Plan refs:** Part IV (consent adapters, phase driver), Part III §3.8 (Consent tab)

## What it is

The adapter framework that drives arbitrary consent management platforms through **four
journeys** — no consent, Reject All, Accept All, withdraw — each in an isolated browser
context, with everything recorded tagged by the consent state it occurred under.

## Why it exists

This is differentiator #2 and the technical foundation everything else rests on. Most
competitors test "does a banner exist." We test **whether Reject All actually rejects and
whether withdrawal actually stops tracking** — which is where real regressions hide.

## Dependencies

Feature 05 (scan engine). Blocks: features 07, 09, 10, 11.

## Public interface

```ts
resolveAdapter(page): Promise<ResolvedAdapter>   // consent/registry.ts
ConsentAdapter                                    // consent/adapters/*
```

## The four phases

| Phase | What we do | Recorded as |
|---|---|---|
| No consent | Load the page, touch nothing, wait 10 s | Baseline — anything firing here is the core finding |
| Reject All | Locate and click "Reject All" | A tracker still firing here is a Critical regression |
| Accept All | Locate and click "Accept All" | Trackers firing here are expected — this is the control |
| Withdraw | Re-open preferences, withdraw consent | Continued tracking here is a real, commonly-missed defect |

Each phase runs in its **own isolated `BrowserContext`** so storage never bleeds between them.

## Build steps

- [ ] Adapter interface + registry + **resolution cascade** (known CMP → generic heuristic → none)
- [ ] Five known adapters: **Cookiebot, CookieYes, Complianz, OneTrust, Usercentrics**
      (Usercentrics needs shadow-DOM traversal)
- [ ] `GenericBannerAdapter` — the four-strategy heuristic cascade
- [ ] **Multilingual button-text matching in seven languages.** The UI is English-only at
      launch; the scanner is not, because client websites are multilingual
- [ ] Four-phase orchestration with isolated contexts + the withdrawal flow
- [ ] Detection confidence scoring per resolution
- [ ] Per-website selector overrides (`acceptSelector`, `rejectSelector`, `preferencesSelector`)
      exposed in website Settings — **this is the support escape hatch**
- [ ] `SCAN_CONSENT_TIMEOUT_MS` (15 s) for locating and clicking a control
- [ ] Consent tab UI: CMP report card, per-phase result cards, per-phase banner screenshots
- [ ] Fixtures F03–F07 covering the phase matrix, plus a no-banner fixture

## The rule that matters most

**A phase that could not be executed is `UNDETERMINED`, never a pass.** If the adapter wasn't
found, the button wasn't located, or the interaction timed out, the UI renders
*"Could not be determined"* with the reason — adapter not found / button not located /
timeout. It propagates to `PARTIAL` at the scan level.

Rendering "no issues found" because we failed to click Reject All would be the single most
damaging bug the product could ship.

## Acceptance criteria

- [ ] All four consent phases execute against fixtures F03–F07
- [ ] A site with no banner is correctly recorded as `cmpId: 'none'`
- [ ] A consent action failure yields `UNDETERMINED` and `PARTIAL`, never a pass
- [ ] Everything recorded is tagged with the phase it occurred under
- [ ] Consent adapter success rate **> 90% per supported CMP** on fixtures
- [ ] Per-website selector overrides let support fix a site **without a deploy**
- [ ] Each phase runs in an isolated context — no storage bleed

## Tests required

| Level | What |
|---|---|
| Unit | Consent text/pattern matching across all seven languages |
| Fixtures | F03–F07 phase matrix; shadow-DOM fixture; no-banner fixture |
| Integration | Context isolation between phases |

## Risk mitigation (this is the High/High risk)

| Mitigation | Status |
|---|---|
| Five known adapters + four-strategy generic cascade | ⬜ |
| Confidence scoring | ⬜ |
| Per-website selector overrides (fix any site without a deploy) | ⬜ |
| 30 fixtures | ⬜ |
| Per-CMP success metrics tracked from day one | ⬜ |

**Assumption to validate (§12.8 #6):** five adapters + generic cover ≥ 80% of UK/EU
agency-managed sites. Measure adapter resolution across the first 1,000 real scans — the
unknown rate directly drives the V1.1 adapter backlog.

## Traps

- Shadow DOM (Usercentrics) and iframes (several CMPs) both defeat naive selector queries.
- SPAs re-render the banner after route changes.
- Some CMPs animate in after several seconds — the 15 s consent timeout exists for this.
- "Reject All" is sometimes two clicks deep behind "Manage preferences". The withdrawal flow
  almost always is.
