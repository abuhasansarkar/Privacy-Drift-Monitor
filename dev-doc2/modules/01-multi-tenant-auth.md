# Module 01 — Multi-Tenant Auth & Tenancy Isolation

> **Tier:** MVP · **Package:** `@pdm/database`, `src/server/auth`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
An agency managing 80 client websites must have strict organizational boundaries. Agency A must never see Agency B's websites, clients, scans, or billing records.

## 2. Architecture & Data Flow
* **Authentication:** Clerk Core 3 (`@clerk/nextjs@^7`).
* **Tenant Scoping:** Prisma extension `forAgency(agencyId)` automatically injects `where: { agencyId }` on all reads, updates, and deletes across 40 tenant models.
* **Support Impersonation:** 30-minute signed JWT ticket with read-only enforcement and customer audit logging.

## 3. Database Schema
```prisma
model Agency {
  id          String         @id @default(uuid())
  clerkOrgId  String         @unique
  name        String
  slug        String         @unique
  members     AgencyMember[]
  websites    Website[]
}

model AgencyMember {
  id        String     @id @default(uuid())
  agencyId  String
  userId    String
  role      AgencyRole @default(DEVELOPER)
  agency    Agency     @relation(fields: [agencyId], references: [id], onDelete: Cascade)
}
```

## 4. Key Files
* `packages/database/src/tenant.ts`: The `forAgency` extension and `TENANT_MODELS` list.
* `src/server/auth/context.ts`: Tenant context resolution (`requireAgencyContext`).
* `src/proxy.ts`: Proxy routing rules and dynamic route gating.

## 5. Acceptance Criteria
* **Given** an authenticated user belonging to Agency A,
* **When** querying websites via `forAgency(agencyA.id).website.findMany()`,
* **Then** only Agency A's websites are returned,
* **And** attempts to update Agency B's website fail closed.
