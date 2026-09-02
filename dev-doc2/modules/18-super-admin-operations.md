# Module 18 — Super-Admin Console (15 Operational Views)

> **Tier:** V1 · **Package:** `src/app/(admin)/admin`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Operating a multi-tenant monitoring SaaS requires deep operational tooling: inspecting failed scans, debugging queue backlogs, updating tracker definitions, and investigating billing exceptions.

## 2. Architecture & The 15 Views
* **Core Ops:** Overview (`/admin`), Agencies (`/admin/agencies`), Users (`/admin/users`), Websites (`/admin/websites`).
* **Scan & Queue Ops:** Scans (`/admin/scans`), BullMQ Live Queue (`/admin/queue`).
* **Intelligence Ops:** Issues (`/admin/issues`), Tracker Catalog CRUD (`/admin/trackers`).
* **Commercial & Costs:** Billing (`/admin/billing`), AI Usage & Spend (`/admin/ai-usage`).
* **SRE & Platform:** System Health (`/admin/system-health`), Audit & Logs (`/admin/logs`), Feature Flags (`/admin/feature-flags`), Settings (`/admin/settings`).

## 3. Security & Impersonation
* Access is gated by `isSuperAdmin: true` on the database User record.
* Customer impersonation requires an explicit reason, generates a 30-minute signed token, grants read-only access, and writes an audit log entry visible to the customer.

## 4. Key Files
* `src/server/admin/context.ts`: Super-admin authorization and read auditing.
* `src/server/admin/impersonation.ts`: Signed customer impersonation tickets.
* `src/app/(admin)/admin/queue/`: BullMQ queue depth and retry management view.

## 5. Acceptance Criteria
* **Given** a user who is not marked `isSuperAdmin`,
* **When** attempting to load `/admin`,
* **Then** the request is rejected with 403 Forbidden,
* **And** a security warning is logged.
