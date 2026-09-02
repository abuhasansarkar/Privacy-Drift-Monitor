# Module 08 — Privacy Drift Engine & Baseline Management

> **Tier:** MVP / V1.5 · **Package:** `@pdm/analysis`, `packages/database`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Competitor tools evaluate static snapshots. Privacy regressions happen when code, plugins, or GTM containers mutate over time. Agencies need to detect *change* and suppress expected updates.

## 2. Architecture & Data Flow
* **Approved Baseline Lifecycle:**
  ```
  Initial Scan → Agency Review → Approve Baseline 1.0 → Scheduled Scan → Diff Engine
  ```
* **Change Classification:** Categorizes variance as *Expected Change* (e.g., scheduled deployment) vs. *Unexpected Drift* (e.g., rogue pixel).
* **Maintenance Windows:** Suppresses alerts during scheduled deployment periods and triggers an automatic verification scan upon completion.

## 3. Database Schema
```prisma
model ScanBaseline {
  id          String   @id @default(uuid())
  websiteId   String
  version     String
  approvedAt  DateTime @default(now())
  approvedBy  String
  snapshot    Json
  website     Website  @relation(fields: [websiteId], references: [id], onDelete: Cascade)
}

model PrivacyDriftEvent {
  id          String   @id @default(uuid())
  agencyId    String
  websiteId   String
  eventType   String   // NEW_TRACKER, COOKIE_CHANGED, CONSENT_REGRESSION
  description String
  detectedAt  DateTime @default(now())
}
```

## 4. Key Files
* `packages/analysis/src/drift.ts`: Longitudinal diffing algorithm.
* `src/app/(app)/app/drift/`: Cross-portfolio privacy drift event feed.
* `src/server/services/maintenance.ts`: Maintenance window alert suppression logic.

## 5. Acceptance Criteria
* **Given** a site with an approved baseline containing 3 trackers,
* **When** a new scan discovers a 4th tracker (TikTok Pixel),
* **Then** a `NEW_TRACKER` Privacy Drift event is created,
* **And** an alert is dispatched to the agency.
