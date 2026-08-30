// Subpath, not the barrel — a component has no business pulling pino and the
// Public Suffix List into its module graph.
import { can, type AgencyRole, type Permission } from "@pdm/shared/permissions";

/**
 * PERMISSION GATE — PLAN.md Part VI §6.2, Phase 1 task 1.2.
 *
 * ⚠️ COSMETIC ONLY. `<Can>` decides what to RENDER. It never decides what is
 * ALLOWED. Every mutation behind it must call `requirePermission()` server-side
 * — and, because Next 16's proxy does not reliably cover Server Actions, that
 * check lives inside the action itself.
 *
 * Hiding a button is a usability improvement. It is not a security control.
 *
 * Usage:
 *   <Can role={ctx.role} permission="website:create">
 *     <AddWebsiteButton />
 *   </Can>
 *
 *   <Can role={ctx.role} permission="billing:manage" fallback={<UpgradeHint />}>
 *     <ChangePlanButton />
 *   </Can>
 */
export function Can({
  role,
  permission,
  children,
  fallback = null,
}: {
  role: AgencyRole;
  /** A single permission, or several — ALL must be held. */
  permission: Permission | Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.every((p) => can(role, p));
  return <>{allowed ? children : fallback}</>;
}
