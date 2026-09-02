# Phase 3 — Agency SaaS Shell & Portfolio Dashboard

> **Goal:** Provide the core authenticated multi-tenant agency application, portfolio health dashboard, website management, client directory, and issue triage queue.  
> **Status:** ✅ Complete & Verified  
> **Modules Covered:** [M01 (Multi-Tenant Auth)](../modules/01-multi-tenant-auth.md), [M11 (Issue Lifecycle)](../modules/11-issue-management-remediation.md), [M12 (Attention Center)](../modules/12-agency-dashboard-attention-center.md)

---

## 1. Scope & Execution Flow

```mermaid
flowchart TD
  User[Agency User Login via Clerk Core 3] --> Sync[Clerk Org Synced to Postgres Agency Record]
  Sync --> Context[requireAgencyContext: Injects agencyId]
  
  Context --> Dash[/app: Portfolio Health & Attention Center]
  Context --> Sites[/app/websites: Website Table, Import & Hub]
  Context --> Issues[/app/issues: Cross-Portfolio Finding Triage]
  Context --> Clients[/app/clients: Client Directory & Assignment]
  
  Dash & Sites & Issues & Clients --> DB[(forAgency Scoped Queries)]
```

---

## 2. Implementation Tasks

| # | Task | Package / Location | DoD Verification |
|---|---|---|---|
| **3.1** | Tenant Extension | `packages/database/src/tenant.ts` | `forAgency` prevents cross-tenant data access |
| **3.2** | Tenant Context Resolution | `src/server/auth/context.ts` | Resolves user, organization, role, and timezone |
| **3.3** | Portfolio Attention Center | `src/app/(app)/app/page.tsx` | Displays high-risk sites, active drift, recent scans |
| **3.4** | Website Hub & Detail Tabs | `src/app/(app)/app/websites/[websiteId]/` | Issues, trackers, cookies, consent, drift, evidence |
| **3.5** | Issue Triage Queue | `src/app/(app)/app/issues/` | Filters by severity, rule, status, and client |

---

## 3. Acceptance Verification Checklist

- [x] Agency A cannot read, update, or delete websites belonging to Agency B.
- [x] Deleting another tenant's row throws an error and leaves the target row untouched.
- [x] Dashboard loads warm in < 2.5s with skeleton loading states.
- [x] Marking an issue resolved automatically enqueues a verification re-scan.
