# Module 12 — Agency Dashboard & Attention Center

> **Tier:** MVP · **Package:** `src/app/(app)/app`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
An agency owner managing 80 client websites cannot open 80 browser tabs to check site status. They need a single rollup dashboard highlighting which sites need attention *today*.

## 2. Architecture & UI Layout
* **Attention Center:** Surfaces sites with critical regressions, score drops > 20 points, or failed scans.
* **Portfolio Rollup:** Aggregate average privacy monitoring score, active website count, and open issue counts grouped by severity.
* **Recent Drift Feed:** Highlights new trackers or cookie additions discovered across the agency portfolio within the past 7 days.

## 3. Key Files
* `src/app/(app)/app/page.tsx`: Main dashboard server component.
* `src/server/queries/dashboard.ts`: High-performance aggregated tenant metrics.
* `src/components/dashboard/attention-center.tsx`: Urgent triage cards.

## 4. Acceptance Criteria
* **Given** an agency with 40 websites where 2 sites experienced drift today,
* **When** navigating to `/app`,
* **Then** the 2 affected sites appear at the top of the Attention Center,
* **And** the page loads in < 2.5s with zero layout shift.
