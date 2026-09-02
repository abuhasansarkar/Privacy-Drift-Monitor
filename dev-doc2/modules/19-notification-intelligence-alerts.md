# Module 19 — Notification Intelligence & Alert Rules

> **Tier:** MVP · **Package:** `@pdm/notifications`, `packages/email`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Alert fatigue is the primary reason monitoring products are cancelled. If an agency receives 15 individual emails when a single client site updates, they disable notifications entirely.

## 2. Architecture & Notification Intelligence
* **Alert Deduplication & Grouping:** Multiple findings discovered during a single scan are aggregated into a single consolidated email.
* **Escalation Rules:** Only Critical severity findings (e.g., pre-consent advertising pixels) trigger immediate alerts.
* **Cadence Options:** Immediate, Daily Digest, or Weekly Executive Summary.
* **Quiet Hours:** Dispatches are held during agency non-working hours (configurable per agency timezone).

## 3. Database Schema
```prisma
model NotificationPreference {
  id          String   @id @default(uuid())
  agencyId    String
  userId      String
  channel     String   // EMAIL, IN_APP, SLACK
  cadence     String   // IMMEDIATE, DAILY_DIGEST, WEEKLY_DIGEST
  quietStart  String?  // "22:00"
  quietEnd    String?  // "08:00"
}
```

## 4. Key Files
* `packages/notifications/src/policy.ts`: Alert routing and quiet hour evaluation.
* `packages/notifications/src/digest.ts`: Daily and weekly digest aggregation.
* `packages/email/src/templates/`: Branded HTML email templates for alerts and digests.

## 5. Acceptance Criteria
* **Given** an agency configured with quiet hours (22:00 to 08:00),
* **When** a scan finishes at 23:30 detecting 3 findings,
* **Then** the notification is queued and dispatched at 08:00 the following morning.
