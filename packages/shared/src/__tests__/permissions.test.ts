import { describe, expect, it } from "vitest";
import {
  AGENCY_ROLES,
  atLeast,
  can,
  isWebsiteInScope,
  permissionsFor,
  type AgencyRole,
} from "../permissions";

/**
 * RBAC MATRIX — PLAN.md Part VI §6.2, Phase 1 task 1.2.
 *
 * Pure functions, no I/O. These run without docker-compose, so they are the
 * fastest signal that the test harness itself is wired correctly.
 */

describe("role hierarchy", () => {
  it("grants strictly more to each senior role", () => {
    const counts = AGENCY_ROLES.map((r) => permissionsFor(r).length);
    // OWNER ⊇ ADMIN ⊇ MANAGER ⊇ DEVELOPER ⊇ VIEWER
    const [owner, admin, manager, developer, viewer] = counts;
    expect(owner).toBeGreaterThan(admin!);
    expect(admin).toBeGreaterThan(manager!);
    expect(manager).toBeGreaterThan(developer!);
    expect(developer).toBeGreaterThan(viewer!);
  });

  it("every junior permission is also held by every senior role", () => {
    const order: AgencyRole[] = ["VIEWER", "DEVELOPER", "MANAGER", "ADMIN", "OWNER"];
    for (let i = 0; i < order.length - 1; i++) {
      const junior = permissionsFor(order[i]!);
      const senior = permissionsFor(order[i + 1]!);
      for (const p of junior) {
        expect(senior, `${order[i + 1]} is missing ${p}`).toContain(p);
      }
    }
  });
});

describe("specific gates from the page specs", () => {
  it("a Viewer can never reach billing (§3.3 — nav is filtered by role)", () => {
    expect(can("VIEWER", "billing:read")).toBe(false);
    expect(can("VIEWER", "billing:manage")).toBe(false);
  });

  it("only the Owner can manage billing (§3.14)", () => {
    expect(can("OWNER", "billing:manage")).toBe(true);
    expect(can("ADMIN", "billing:manage")).toBe(false);
  });

  it("a Developer can trigger scans and read evidence (§3.8)", () => {
    expect(can("DEVELOPER", "scan:trigger")).toBe(true);
    expect(can("DEVELOPER", "evidence:read")).toBe(true);
  });

  it("a Viewer cannot read raw evidence or trigger a scan", () => {
    expect(can("VIEWER", "evidence:read")).toBe(false);
    expect(can("VIEWER", "scan:trigger")).toBe(false);
  });

  it("ignoring an issue is Manager+ (§3.10)", () => {
    expect(can("MANAGER", "issue:ignore")).toBe(true);
    expect(can("DEVELOPER", "issue:ignore")).toBe(false);
  });

  it("archive and delete are Admin+ (§3.5)", () => {
    expect(can("ADMIN", "website:delete")).toBe(true);
    expect(can("MANAGER", "website:delete")).toBe(false);
    expect(can("MANAGER", "website:archive")).toBe(false);
  });

  it("no role below Admin can change branding or read the audit log", () => {
    expect(can("MANAGER", "branding:update")).toBe(false);
    expect(can("MANAGER", "audit:read")).toBe(false);
    expect(can("ADMIN", "audit:read")).toBe(true);
  });
});

describe("atLeast", () => {
  it("compares rank, not alphabetical order", () => {
    expect(atLeast("OWNER", "MANAGER")).toBe(true);
    expect(atLeast("MANAGER", "MANAGER")).toBe(true);
    expect(atLeast("DEVELOPER", "MANAGER")).toBe(false);
  });
});

describe("website scope", () => {
  it("an EMPTY scope means all websites, not none", () => {
    // The inverted reading of this would silently lock every member out of
    // every site — an empty array is the default on AgencyMember.
    expect(isWebsiteInScope([], "any-website-id")).toBe(true);
  });

  it("a non-empty scope restricts to the listed ids", () => {
    expect(isWebsiteInScope(["a", "b"], "a")).toBe(true);
    expect(isWebsiteInScope(["a", "b"], "c")).toBe(false);
  });
});
