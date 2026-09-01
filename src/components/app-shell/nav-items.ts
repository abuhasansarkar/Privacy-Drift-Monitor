import { t } from "@pdm/shared/copy";
import type { Permission } from "@pdm/shared/permissions";
import { FLAGS, type FlagKey } from "@pdm/shared/flags";

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
  icon:
    | "grid"
    | "users"
    | "globe"
    | "alert"
    | "drift"
    | "doc"
    | "team"
    | "settings"
    | "bell"
    | "sparkle"
    | "card"
    | "help";
  permission: Permission;
  /** Marks the entry active for `/app/websites/new` as well as the list. */
  matchPrefix?: boolean;
  /**
   * A feature flag that must ALSO be on for this entry to render.
   *
   * ⚠️ THE PERMISSION AND THE FLAG ARE DIFFERENT QUESTIONS. `permission` asks
   * "may this role use it"; `flag` asks "does it exist here yet". A Manager has
   * `ai:generate` whether or not `/app/ai` is switched on, so gating the entry
   * on the permission alone would show every Manager a link that 404s.
   *
   * Resolved on the SERVER (the layout) and passed down as `enabledFlags` —
   * this file is imported by a Client Component, which cannot read the flag
   * table.
   */
  flag?: FlagKey;
  /** Grouping in the sidebar: main top section or pinned bottom section. */
  section?: "main" | "bottom";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/app",
    label: t("navApp.dashboard"),
    icon: "grid",
    permission: "website:read",
    section: "main",
  },
  {
    href: "/app/clients",
    label: t("navApp.clients"),
    icon: "users",
    permission: "client:read",
    matchPrefix: true,
    section: "main",
  },
  {
    href: "/app/websites",
    label: t("navApp.websites"),
    icon: "globe",
    permission: "website:read",
    matchPrefix: true,
    section: "main",
  },
  {
    href: "/app/issues",
    label: t("navApp.issues"),
    icon: "alert",
    permission: "issue:read",
    matchPrefix: true,
    section: "main",
  },
  {
    // Directly after Issues: the two are read together — an issue says what is
    // wrong, drift says when it started.
    href: "/app/drift",
    label: t("navApp.drift"),
    icon: "drift",
    permission: "issue:read",
    matchPrefix: true,
    section: "main",
  },
  {
    // Between the work queues and the artefacts: it acts ON findings, so it
    // belongs after them and before Reports.
    href: "/app/ai",
    label: t("aiAssistant.title"),
    icon: "sparkle",
    permission: "ai:generate",
    flag: FLAGS.AI_ASSISTANT_PAGE,
    matchPrefix: true,
    section: "main",
  },
  {
    href: "/app/trackers",
    label: t("navApp.trackers"),
    icon: "globe",
    permission: "website:read",
    matchPrefix: true,
    section: "main",
  },
  {
    href: "/app/reports",
    label: t("navApp.reports"),
    icon: "doc",
    permission: "report:read",
    matchPrefix: true,
    section: "main",
  },
  {
    // Directly before Team: alert rules are configuration, not a work queue,
    // so they sit with the administrative entries rather than beside Issues.
    href: "/app/alerts",
    label: t("alerts.title"),
    icon: "bell",
    permission: "alert:read",
    matchPrefix: true,
    section: "main",
  },
  {
    href: "/app/team",
    label: t("navApp.team"),
    icon: "team",
    permission: "team:read",
    matchPrefix: true,
    section: "main",
  },
  {
    // Bottom group: billing, help, and settings pinned to the lower rail.
    href: "/app/billing",
    label: t("billing.title"),
    icon: "card",
    permission: "billing:read",
    matchPrefix: true,
    section: "bottom",
  },
  {
    href: "/app/help",
    label: t("help.title"),
    icon: "help",
    permission: "website:read",
    matchPrefix: true,
    section: "bottom",
  },
  {
    href: "/app/settings",
    label: t("navApp.settings"),
    icon: "settings",
    permission: "settings:read",
    matchPrefix: true,
    section: "bottom",
  },
];

/** Exact match for `/app`, prefix match for the rest — `/app` is everyone's parent. */
export function isActive(item: NavItem, pathname: string): boolean {
  return item.matchPrefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}
