/**
 * RBAC MATRIX — PLAN.md Part VI §6.2.
 *
 * ONE definition, imported by BOTH the UI (`<Can>`) and the server
 * (`requirePermission`). Two matrices that can drift is how a button gets
 * hidden while the endpoint behind it stays open.
 *
 * ⚠️ The UI check is cosmetic. `<Can>` decides what to RENDER; it never decides
 * what is ALLOWED. Every mutation re-checks server-side — and, because Next 16's
 * proxy does not reliably cover Server Actions, that check happens inside the
 * action itself, not in `proxy.ts` (§6.1).
 *
 * Roles mirror `AgencyRole` in schema.prisma. Keep them in sync.
 */

export const AGENCY_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DEVELOPER",
  "VIEWER",
] as const;

export type AgencyRole = (typeof AGENCY_ROLES)[number];

/** Higher wins. Used only for "at least this role" comparisons. */
const ROLE_RANK: Record<AgencyRole, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export const PERMISSIONS = [
  // websites
  "website:read",
  "website:create",
  "website:update",
  "website:pause",
  "website:archive",
  "website:delete",
  "website:import",
  // clients
  "client:read",
  "client:create",
  "client:update",
  "client:archive",
  "client:portal_toggle",
  // scans
  "scan:read",
  "scan:trigger",
  "evidence:read",
  "evidence:export",
  // issues
  "issue:read",
  "issue:transition",
  "issue:assign",
  "issue:ignore",
  // reports
  "report:read",
  "report:generate",
  "report:delete",
  "report:share",
  // alerts
  "alert:read",
  "alert:manage",
  // ai
  "ai:read",
  "ai:generate",
  "ai:configure",
  // team
  "team:read",
  "team:invite",
  "team:role_change",
  "team:remove",
  // agency
  "settings:read",
  "settings:update",
  "branding:update",
  "audit:read",
  "billing:read",
  "billing:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Explicit grants per role. Deliberately written out rather than derived from
 * rank, because several rules are NOT monotonic — a Developer may trigger scans
 * and read raw evidence, which a Manager (a commercial role) does not need.
 */
const VIEWER: Permission[] = [
  "website:read",
  "client:read",
  "scan:read",
  "issue:read",
  "report:read",
  "alert:read",
  "ai:read",
  "team:read",
  "settings:read",
];

const DEVELOPER: Permission[] = [
  ...VIEWER,
  "scan:trigger",
  "evidence:read",
  "evidence:export",
  "issue:transition",
];

const MANAGER: Permission[] = [
  ...DEVELOPER,
  "website:create",
  "website:update",
  "website:pause",
  "website:import",
  "client:create",
  "client:update",
  "issue:assign",
  "issue:ignore",
  "report:generate",
  "report:share",
  "alert:manage",
  "ai:generate",
];

const ADMIN: Permission[] = [
  ...MANAGER,
  "website:archive",
  "website:delete",
  "client:archive",
  "client:portal_toggle",
  "report:delete",
  "team:invite",
  "team:role_change",
  "team:remove",
  "settings:update",
  "branding:update",
  "audit:read",
  "ai:configure",
  "billing:read",
];

/** Only the Owner can move money or change the plan (§3.14). */
const OWNER: Permission[] = [...ADMIN, "billing:manage"];

const MATRIX: Record<AgencyRole, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEWER),
  DEVELOPER: new Set(DEVELOPER),
  MANAGER: new Set(MANAGER),
  ADMIN: new Set(ADMIN),
  OWNER: new Set(OWNER),
};

export function can(role: AgencyRole, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function canAll(role: AgencyRole, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export function atLeast(role: AgencyRole, minimum: AgencyRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function permissionsFor(role: AgencyRole): Permission[] {
  return [...MATRIX[role]];
}

/**
 * Website-scope restriction (§6.2). A member may be limited to specific sites;
 * an EMPTY scope means "all websites in the agency", not "none".
 */
export function isWebsiteInScope(
  websiteScope: readonly string[],
  websiteId: string,
): boolean {
  return websiteScope.length === 0 || websiteScope.includes(websiteId);
}

/**
 * Ignoring an issue always requires a written reason (§3.10) — a Manager+ gate
 * plus an audit trail, because suppressing a finding is the action most likely
 * to be questioned later.
 */
export const REQUIRES_REASON: readonly Permission[] = [
  "issue:ignore",
  "website:delete",
] as const;
