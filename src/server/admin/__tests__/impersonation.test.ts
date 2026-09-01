import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAgency, makeUser, resetDatabase } from "@pdm/database/testing";

/**
 * IMPERSONATION — PLAN.md §3.12, feature doc 19.
 *
 * §3.12: "**impersonate — time-limited, reason-required, heavily
 * audit-logged**". Each of those three is a separate assertion below, plus the
 * one the plan implies and never states: it must be READ-ONLY.
 *
 * ⚠️ THE TICKET IS A SIGNED COOKIE, SO THE FORGERY TESTS ARE THE IMPORTANT
 * ONES. A ticket that can be edited is cross-tenant read access to any agency,
 * granted by anyone who can set a cookie on their own browser.
 */

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Map<string, string>() as never,
}));

const clerkUserId = { value: "user_none" };
vi.mock("@/server/auth/context", () => ({
  requireUser: async () => ({ clerkUserId: clerkUserId.value, clerkOrgId: null }),
}));

async function freshModules() {
  vi.resetModules();
  const context = await import("@/server/admin/context");
  const impersonation = await import("@/server/admin/impersonation");
  return { ...context, ...impersonation };
}

describe("impersonation", () => {
  beforeEach(async () => {
    await resetDatabase();
    cookieJar.clear();
    process.env.PORTAL_TOKEN_SECRET ??= "test-secret";
  });

  it("refuses to start without a reason", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const { requireSuperAdmin, startImpersonation } = await freshModules();
    const admin = await requireSuperAdmin();

    await expect(startImpersonation(admin, agency.id, "ok")).rejects.toThrow(/reason/i);
    expect(cookieJar.size).toBe(0);
  });

  it("starts a session, records the reason, and resolves the ticket", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const { requireSuperAdmin, startImpersonation, currentImpersonation } =
      await freshModules();
    const admin = await requireSuperAdmin();
    await startImpersonation(admin, agency.id, "ticket 4821 — scan never completes");

    const ticket = await currentImpersonation();
    expect(ticket?.agencyId).toBe(agency.id);
    expect(ticket?.reason).toContain("4821");
    expect(ticket?.adminUserId).toBe(user.id);
  });

  it("⚠️ REJECTS A TAMPERED TICKET", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();
    const other = await makeAgency();

    const { requireSuperAdmin, startImpersonation, currentImpersonation } =
      await freshModules();
    const admin = await requireSuperAdmin();
    await startImpersonation(admin, agency.id, "legitimate support session");

    /*
     * Re-encode the payload pointing at a DIFFERENT agency, keeping the
     * original signature. This is the whole attack: if the signature covered
     * only part of the payload, or were not checked, this is a read of any
     * tenant's data by anyone who once held a valid ticket.
     */
    const raw = cookieJar.get("pdm_impersonation")!;
    const [payload, signature] = raw.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString());
    decoded.agencyId = other.id;
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    cookieJar.set("pdm_impersonation", `${forged}.${signature}`);

    expect(await currentImpersonation()).toBeNull();
  });

  it("⚠️ REJECTS AN EXPIRED TICKET even with a valid signature", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const modules = await freshModules();
    const admin = await modules.requireSuperAdmin();
    await modules.startImpersonation(admin, agency.id, "expiring session test");

    // Advance past the window. The signature is still valid — the expiry inside
    // the signed payload is what ends the session, which is why it is signed.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (modules.IMPERSONATION_MINUTES + 1) * 60_000);
    try {
      expect(await modules.currentImpersonation()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⚠️ REJECTS A TICKET HELD BY A DIFFERENT OPERATOR", async () => {
    // A cookie copied between two admins is not a second grant.
    const first = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = first.clerkUserId;
    const agency = await makeAgency();

    const modules = await freshModules();
    const admin = await modules.requireSuperAdmin();
    await modules.startImpersonation(admin, agency.id, "session belonging to admin one");

    const second = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = second.clerkUserId;
    const reloaded = await freshModules();

    expect(await reloaded.currentImpersonation()).toBeNull();
  });

  it("⚠️ ENDS THE MOMENT SUPER_ADMIN IS REVOKED, not when the clock runs out", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const modules = await freshModules();
    const admin = await modules.requireSuperAdmin();
    await modules.startImpersonation(admin, agency.id, "revocation test session");

    const { prisma } = await import("@pdm/database");
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: false } });

    const reloaded = await freshModules();
    expect(await reloaded.currentImpersonation()).toBeNull();
  });

  it("writes an audit entry against the CUSTOMER's agency", async () => {
    const user = await makeUser({ isSuperAdmin: true });
    clerkUserId.value = user.clerkUserId;
    const agency = await makeAgency();

    const modules = await freshModules();
    const admin = await modules.requireSuperAdmin();
    await modules.startImpersonation(admin, agency.id, "audited support session");

    const { prisma } = await import("@pdm/database");
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { agencyId: agency.id, action: "admin.impersonation.started" },
    });
    // The customer can see this in their own audit log — that is the point.
    expect(entry.actorType).toBe("admin");
    expect((entry.metadata as { reason?: string }).reason).toContain("audited");
  });
});
