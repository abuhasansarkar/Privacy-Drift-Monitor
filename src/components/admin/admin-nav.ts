import { t } from "@pdm/shared/copy";

/**
 * ADMIN NAVIGATION — PLAN.md §3.12's fifteen pages, in operational order.
 *
 * ⚠️ GROUPED BY WHAT YOU ARE DOING, NOT ALPHABETICALLY. An operator opens this
 * panel for one of three reasons — something is broken, a customer needs help,
 * or the product needs tuning — and the grouping is those three. A flat list of
 * fifteen makes the 3am page ("which one has the queue?") slower than it needs
 * to be.
 */

export interface AdminNavItem {
  href: string;
  label: string;
  group: "operate" | "support" | "tune";
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: t("admin.navOverview"), group: "operate" },
  { href: "/admin/queue", label: t("admin.navQueue"), group: "operate" },
  { href: "/admin/system-health", label: t("admin.navSystemHealth"), group: "operate" },
  { href: "/admin/scans", label: t("admin.navScans"), group: "operate" },
  { href: "/admin/logs", label: t("admin.navLogs"), group: "operate" },

  { href: "/admin/agencies", label: t("admin.navAgencies"), group: "support" },
  { href: "/admin/users", label: t("admin.navUsers"), group: "support" },
  { href: "/admin/websites", label: t("admin.navWebsites"), group: "support" },
  { href: "/admin/billing", label: t("admin.navBilling"), group: "support" },
  { href: "/admin/ai-usage", label: t("admin.navAiUsage"), group: "support" },

  { href: "/admin/issues", label: t("admin.navIssues"), group: "tune" },
  { href: "/admin/trackers", label: t("admin.navTrackers"), group: "tune" },
  { href: "/admin/feature-flags", label: t("admin.navFlags"), group: "tune" },
  { href: "/admin/settings", label: t("admin.navSettings"), group: "tune" },
];

export const ADMIN_GROUPS: ReadonlyArray<{ key: AdminNavItem["group"]; label: string }> = [
  { key: "operate", label: "Operate" },
  { key: "support", label: "Support" },
  { key: "tune", label: "Tune" },
];

/** `/admin` matches exactly; everything else matches its prefix. */
export function isAdminActive(href: string, pathname: string): boolean {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}
