# Module 14 — Client Portal & Passwordless Magic Links

> **Tier:** MVP · **Package:** `src/app/(portal)`, `src/server/portal`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Client stakeholders do not want to manage passwords or navigate complex agency settings. They need a simple, branded, read-only link to view monitoring status and download PDFs.

## 2. Architecture & Data Isolation
* **Authentication:** Passwordless magic-link sessions (`/portal/auth`). Signed HMAC tokens expire in 14 days.
* **Strict Tenancy:** Portal users are mapped to a specific `clientId`. They can only access websites assigned to their client profile.
* **Agency Isolation:** Portal sessions have zero access to agency billing, team management, or internal developer notes.

## 3. Database Schema
```prisma
model PortalUser {
  id        String          @id @default(uuid())
  agencyId  String
  clientId  String
  email     String
  sessions  PortalSession[]
}

model PortalSession {
  id        String     @id @default(uuid())
  userId    String
  tokenHash String     @unique
  expiresAt DateTime
}
```

## 4. Key Files
* `src/proxy.ts`: Directs `/portal/*` traffic to bypass Clerk authentication.
* `src/app/(portal)/portal/`: Client portal views (overview, issues, reports).
* `src/server/portal/auth.ts`: Magic link generation and token validation.

## 5. Acceptance Criteria
* **Given** a magic-link invitation sent to `client@brand.com`,
* **When** clicking the link in email,
* **Then** the user logs into `/portal` without a password,
* **And** attempts to access `/app` or other clients' websites fail closed with 403 Forbidden.
