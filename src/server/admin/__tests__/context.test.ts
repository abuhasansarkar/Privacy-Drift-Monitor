import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pdm/database";
import { makeAgency, makeUser, resetDatabase } from "@pdm/database/testing";

/**
 * THE ADMIN BOUNDARY — PLAN.md §3.12, feature doc 19.
 *
 * ⚠️ THE ACCEPTANCE CRITERION IS "A non-`SUPER_ADMIN` user is blocked at the
 * layout **and** at every route handler", and this suite tests the second
 * half — the one that is actually load-bearing. A layout is not in the request
 * path of a Server Action or a route handler, so a gate that lives only there
 * protects nothing that matters.
 *
 * ⚠️ `requireSuperAdmin` IS `cache()`-WRAPPED, so each test re-imports the
 * module. React's cache is per-request in production and per-module here;
 * without the reset, the second test would read the first test's answer.
 *
 * ⚠️ THE REFUSAL IS ASSERTED ON `code`, NOT ON `instanceof`. `vi.resetModules()`
 * re-evaluates `@pdm/shared/errors` too, so the `AuthorizationError` the module
 * throws is a DIFFERENT CLASS OBJECT from the one this file imported and the
 * instance check fails on an error that is entirely correct. The stable
 * machine-readable code is what the rest of the product routes on anyway
 * (AGENTS.md: "stable machine-readable error codes").
 */
async function expectForbidden(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
}

const clerkUserId = { value: "user_none" };
vi.mock("@/server/auth/context", () => ({
  requireUser: async () => ({ clerkUserId: clerkUserId.value, clerkOrgId: null }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>() as never,
}));

async function freshModule() {
  vi.resetModules();
  return import("@/server/admin/context");
}

describe("requireSuperAdmin", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("throws for a user who is not a super admin", async () => {
    const user = await makeUser({ isSuperAdmin: false });
    clerkUserId.value = user.clerkUserId;

    const { requireSuperAdmin } = await freshModule();
    await expectForbidden(requireSuperAdmin());
  });

  it("⚠️ THROWS FOR AN AGENCY OWNER — SUPER_ADMIN IS NOT AN AGENCY ROLE", async () => {
    /*
     * §3.12 is explicit: "which is **not** an agency role". Conflating the two
     * would make every Owner of every tenant a platform operator, which is a
     * cross-tenant read of the entire customer base.
     */
    const agency = await makeAgency();
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: agency.ownerId } });
    clerkUserId.value = owner.clerkUserId;

    const { requireSuperAdmin } = await freshModule();
    await expectForbidden(requireSuperAdmin());
  });

  it("resolves for a super admin", async () => {
    const user = await makeUser({ isSuperAdmin: true, email: "ops@example.test" });
    clerkUserId.value = user.clerkUserId;

    const { requireSuperAdmin } = await freshModule();
    const admin = await requireSuperAdmin();
    expect(admin.email).toBe("ops@example.test");
  });

  it("⚠️ READS THE FLAG FROM THE DATABASE, so revocation is immediate", async () => {
    /*
     * A Clerk public-metadata claim is carried in a token minted before the
     * flag was revoked. The row is the only thing that is true right now, and
     * admin access is the one place a minute of staleness is unacceptable.
     */
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;

    const first = await freshModule();
    await expect(first.requireSuperAdmin()).resolves.toBeTruthy();

    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: false } });

    const second = await freshModule();
    await expectForbidden(second.requireSuperAdmin());
  });

  it("isSuperAdmin() answers without throwing", async () => {
    const user = await makeUser({ isSuperAdmin: false });
    clerkUserId.value = user.clerkUserId;

    const { isSuperAdmin } = await freshModule();
    await expect(isSuperAdmin()).resolves.toBe(false);
  });
});

describe("auditAdminRead", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("⚠️ WRITES AN ENTRY FOR A READ, AGAINST THE CUSTOMER'S AGENCY", async () => {
    /*
     * §3.12: "Admin access is fully audit-logged, **including reads of tenant
     * data**." Recording it against the customer's `agencyId` is what lets that
     * customer see it in their own audit log — an admin log only we can read
     * answers "what did you change" and never "who looked at my evidence".
     */
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const { auditAdminRead, requireSuperAdmin } = await freshModule();
    const admin = await requireSuperAdmin();

    await auditAdminRead(admin, {
      agencyId: agency.id,
      entityType: "agency",
      entityId: agency.id,
      action: "admin.read.agency_detail",
    });

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { agencyId: agency.id },
    });
    expect(entry.actorType).toBe("admin");
    expect(entry.userId).toBe(user.id);
    expect(entry.action).toBe("admin.read.agency_detail");
  });

  it("never throws when the write fails — a page must not 500 over a log line", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;

    const { auditAdminRead, requireSuperAdmin } = await freshModule();
    const admin = await requireSuperAdmin();

    // A non-existent agency violates the foreign key.
    await expect(
      auditAdminRead(admin, {
        agencyId: "00000000-0000-0000-0000-000000000000",
        entityType: "agency",
        entityId: "x",
      }),
    ).resolves.toBeUndefined();
  });
});
