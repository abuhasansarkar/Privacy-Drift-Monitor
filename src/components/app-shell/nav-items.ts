import { t } from "@pdm/shared/copy";
import type { Permission } from "@pdm/shared/permissions";

/**
 * SIDEBAR NAVIGATION — §3.3.
 *
 * One definition, consumed by the desktop rail and the mobile drawer, so the
 * two can never offer different destinations.
 *
 * Each entry names the permission that makes it meaningful. `<Can>` hides what
 * a role cannot use — a Viewer never sees Billing (§6.2) — but hiding is
 * cosmetic: the page behind it still calls `requirePermission()`.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: "grid" | "users" | "globe" | "alert" | "doc" | "team" | "settings";
  permission: Permission;
  /** Marks the entry active for `/app/websites/new` as well as the list. */
  matchPrefix?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/app",
    label: t("navApp.dashboard"),
    icon: "grid",
    permission: "website:read",
  },
  {
    href: "/app/clients",
    label: t("navApp.clients"),
    icon: "users",
    permission: "client:read",
    matchPrefix: true,
  },
  {
    href: "/app/websites",
    label: t("navApp.websites"),
    icon: "globe",
    permission: "website:read",
    matchPrefix: true,
  },
  {
    href: "/app/issues",
    label: t("navApp.issues"),
    icon: "alert",
    permission: "issue:read",
    matchPrefix: true,
  },
  {
    href: "/app/reports",
    label: t("navApp.reports"),
    icon: "doc",
    permission: "report:read",
    matchPrefix: true,
  },
  {
    href: "/app/team",
    label: t("navApp.team"),
    icon: "team",
    permission: "team:read",
    matchPrefix: true,
  },
  {
    href: "/app/settings",
    label: t("navApp.settings"),
    icon: "settings",
    permission: "settings:read",
    matchPrefix: true,
  },
];

/** Exact match for `/app`, prefix match for the rest — `/app` is everyone's parent. */
export function isActive(item: NavItem, pathname: string): boolean {
  return item.matchPrefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}
