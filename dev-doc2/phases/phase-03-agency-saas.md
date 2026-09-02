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

| # | Task | Package / Location | DoD Verification | Status |
|---|---|---|---|---|
| **3.1** | Multi-Tenant Scoping Extension | `packages/database/src/tenant.ts` | `forAgency(agencyId)` automatically injects `where: { agencyId }` across 40 tenant models | ✅ Verified (19/19 tests) |
| **3.2** | Tenant Context Resolution | `src/server/auth/context.ts` | Resolves Clerk org, RBAC permissions, timezone, and support impersonation sessions | ✅ Verified (7/7 tests) |
| **3.3** | Portfolio Attention Center | `src/app/(app)/app/page.tsx` | Parallel query resolution (`Promise.all`), attention cards, nullable scores (`—`) | ✅ Verified |
| **3.4** | Website Hub & 8 Detail Tabs | `src/app/(app)/app/websites/[websiteId]/` | Scans, Issues, Trackers, Cookies, Consent, Drift, Evidence, and Reports | ✅ Verified |
| **3.5** | Issue Triage & Auto-Verification | `src/app/(app)/app/issues/` | Transitions (`RESOLVED` enqueues `trigger: "VERIFICATION"`), reason-mandatory ignore | ✅ Verified (22/22 tests) |

---

## 3. Acceptance Verification Checklist

- [x] **Strict Tenant Scoping:** Agency A cannot read, update, or delete websites, issues, or scans belonging to Agency B.
- [x] **Fail-Closed Write Isolation:** Deleting or updating another tenant's row throws an error and leaves the target row completely untouched.
- [x] **Dashboard Performance:** Dashboard loads warm in < 2.5s with responsive layouts (1 → 2 → 4 columns) and skeleton loading states.
- [x] **Verification Re-Scan Pipeline:** Marking an issue `RESOLVED` in `setIssueStatus` automatically triggers a verification re-scan.
- [x] **Mandatory Reason for Ignore:** Suppressing an issue requires a reason of at least 10 characters and the `issue:ignore` permission.
- [x] **Support Impersonation Guard:** 30-minute signed token tickets enforce read-only access and write customer-visible audit logs.

---

## 4. Verification Commands

```powershell
# Run all Phase 3 tenant, server, and repository tests (148 tests)
npx.cmd vitest run src/server packages/database

# Run terminology check
npm.cmd run check:terminology

# Run linter
npm.cmd run lint
```

