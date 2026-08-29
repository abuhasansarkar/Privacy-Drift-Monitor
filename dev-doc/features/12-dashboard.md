# Feature 12 — Dashboard & Onboarding

> **Phase:** 1 (shell + onboarding) → 3 (live widgets) · **Priority:** P0 · **Effort:** S + M + L · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part III §3.4, Part XI §11.9 (onboarding), §11.10 (first value)

## What it is

`/app` — six widgets answering *"what needs my attention right now?"* in under five seconds.
Plus the onboarding wizard that gets a new user from signup to their first scan result.

## Why it exists

JTBD J2: *"Tell me which of my 80 sites needs attention today."* Persona A cannot open 80
tabs. And onboarding owns **activation**, which is the metric everything else depends on.

## Dependencies

Shell + empty states: Phase 1. Live widgets: features 09, 10, 11.

## The six widgets

| # | Widget | API | Notes |
|---|---|---|---|
| 1 | Summary strip — 7 stat tiles | `GET /api/dashboard/summary` | Each tile is a **filter link** into the relevant list; trend arrow vs. previous period |
| 2 | **Attention Center** | `GET /api/dashboard/attention` | The most important component on the page |
| 3 | Privacy Health Trend | `GET /api/dashboard/health-trend?days=30` | Line chart with drift events as annotation markers |
| 4 | Privacy Drift Summary | `GET /api/dashboard/drift-summary?days=7` | Each clause links into `/app/drift` pre-filtered |
| 5 | Websites Needing Attention | — | Top 10 by lowest health score |
| 6 | Recent Activity | `GET /api/dashboard/activity?cursor=` | Cursor-paginated, 20 at a time |

### Attention Center — the ordering rule

A prioritized, **deduplicated** list ordered by a computed urgency score, drawing from:

- Critical issues (newest first)
- New trackers detected in the last 7 days
- Consent regressions (Reject All stopped working)
- Failed scans (3+ consecutive failures on one site)
- Websites with no successful scan in > 2× their scan interval

Each row: severity dot · website · one-line description · relative time · quick actions
(View · Acknowledge · Re-scan).

Empty state: *"Nothing needs your attention. 47 websites monitored, all scanned within the
last 24 hours."* — the count is what makes the emptiness credible.

## Build steps

- [ ] Dashboard shell + whole-page zero state (replaces everything with an onboarding CTA card)
- [ ] Each widget in its **own `<Suspense>` with its own skeleton and its own error boundary**
      — a slow widget must not block the page, and a failed one shows "Couldn't load — retry"
- [ ] Redis caching of dashboard summaries
- [ ] Mobile: widgets stack, summary strip becomes 2-column, Attention Center rows become cards
- [ ] Analytics: `dashboard_viewed`, `attention_item_clicked {type}`, `dashboard_widget_error {widget}`

## Onboarding (Part XI §11.9)

**Target: under 4 minutes to a running first scan.**

```
1  Welcome                                          15s
2  Agency name        pre-filled from email domain  20s
3  Agency type        segmentation data             10s
4  Portfolio size     drives plan recommendation    10s
5  First website      live validation               45s   ← pre-filled from a free scan if present
6  Scan frequency     Weekly recommended            15s
7  Initial scan       live progress panel           ~2m   ← THE VALUE MOMENT
8  First result       score + guided tour           45s
9  Alerts             email + digest choice         20s
10 Branding           logo — SKIPPABLE              30s
```

- [ ] Steps 2–6 are **one scrolling page, not ten modals**
- [ ] Every step after 5 is skippable; progress saves per step so an interrupted signup resumes
- [ ] Step 7 shows real progress with real findings, and invites adding a second website while
      it runs — dead time becomes activation
- [ ] Step 10 is last and optional. Branding matters enormously for retention but must never
      stand between signup and first value
- [ ] Read the `free_scan_token` cookie to pre-fill the first website

## First value moment

**Activation event: the user views the results of their first completed scan.** Instrumented
as `scan_completed` followed by a result view in the same session.

Supporting mechanics that must actually ship:
- [ ] The baseline scan is queued at **HIGH priority** so new users never wait behind
      scheduled work
- [ ] The progress panel makes the wait informative
- [ ] **If the first scan fails, the failure screen is a designed experience** with retry and
      "try a different URL" — not a dead end

## Acceptance criteria

- [ ] The dashboard answers "what needs me today" without scrolling on desktop
- [ ] Each widget loads, errors and empties independently
- [ ] Attention Center is deduplicated and correctly ordered
- [ ] Every stat tile links to the correctly pre-filtered list
- [ ] Onboarding completes in under 4 minutes to a running scan
- [ ] An interrupted onboarding resumes where it left off
- [ ] A failed first scan shows the designed failure experience

## Traps

- Low activation (signups that never scan) is a Medium/High risk. The whole onboarding design
  exists to counter it — **instrument the activation funnel from day one**, not after launch.
- Don't let the health-trend chart block first paint; it is the slowest widget.
