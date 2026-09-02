# Module 06 — Tracker Vendor Database & Unknown Tracker Triage

> **Tier:** MVP · **Package:** `@pdm/analysis`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Showing raw network hostnames (e.g., `tr.snapchat.com` or `a.teads.tv`) to non-technical account managers causes confusion. The platform maps requests to verified vendor entities and categorizes them.

## 2. Architecture & Classification Pipeline
* **Catalog:** 2,500+ curated tracking entities with category assignments (Advertising, Analytics, Tag Manager, Session Replay, Social).
* **Multi-Signal Matching:** URL regex patterns, script path signatures, cookie names (`_fbp`, `_ga`, `_uetvid`), and query keys.
* **Unknown Tracker Triage:**
  ```
  Unrecognized Domain → Flagged Unknown → AI Suggestion → Admin Review → Verified Rule
  ```

## 3. Database Schema
```prisma
model TrackerVendor {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  category    String
  riskLevel   String   @default("MEDIUM")
  domains     String[]
  scriptRegex String[]
  cookieNames String[]
}
```

## 4. Key Files
* `packages/analysis/src/tracker/classifier.ts`: Classification matching engine.
* `packages/database/prisma/seed.ts`: Seed data for the master vendor catalog.
* `src/app/(app)/app/trackers/`: Agency-wide vendor inventory view.

## 5. Acceptance Criteria
* **Given** an HTTP request to `connect.facebook.net/en_US/fbevents.js`,
* **When** the classifier evaluates the request,
* **Then** it identifies the vendor as **Meta**, category as **Advertising**, and risk level as **High**.
