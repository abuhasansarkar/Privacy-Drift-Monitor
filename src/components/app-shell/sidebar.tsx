"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { t } from "@pdm/shared/copy";
import { can, type AgencyRole } from "@pdm/shared/permissions";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import {
  ActivityIcon,
  AlertCircleIcon,
  BellIcon,
  CardIcon,
  DocIcon,
  GlobeIcon,
  GridIcon,
  HelpCircleIcon,
  SlidersIcon,
  SparkleIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { isActive, NAV_ITEMS, type NavItem } from "./nav-items";
import { ActiveHighlight, LinkPending, NavGroup } from "./nav-motion";

/**
 * SIDEBAR — §3.3.
 *
 * A Client Component because it reads `usePathname()` to mark the active
 * destination. It takes the ROLE as a prop rather than resolving context
 * itself: tenant context is server-side only, and shipping a resolver to the
 * browser would put the membership lookup on the client.
 */

const ICONS: Record<NavItem["icon"], typeof GridIcon> = {
  grid: GridIcon,
  users: UsersIcon,
  globe: GlobeIcon,
  alert: AlertCircleIcon,
  drift: ActivityIcon,
  doc: DocIcon,
  team: UsersIcon,
  settings: SlidersIcon,
  bell: BellIcon,
  sparkle: SparkleIcon,
  card: CardIcon,
  help: HelpCircleIcon,
};

export function Sidebar({
  role,
  agencyName,
  websitesUsed,
  websiteLimit,
  enabledFlags,
  onNavigate,
}: {
  role: AgencyRole;
  agencyName: string;
  websitesUsed: number;
  /** Null while entitlements are stubbed — the meter then hides rather than lying. */
  websiteLimit: number | null;
  /** Flags resolved on the server. An entry with a `flag` needs it listed. */
  enabledFlags?: readonly string[];
  /** Set by the mobile drawer so tapping a link closes it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter(
    (item) =>
      can(role, item.permission) &&
      // ⚠️ AN ENTRY WITH A FLAG IS HIDDEN UNLESS THE FLAG IS RESOLVED ON.
      // Failing closed matters here: `enabledFlags` is optional, so a caller
      // that forgets to pass it hides a flagged link rather than showing one
      // that 404s.
      (!item.flag || (enabledFlags?.includes(item.flag) ?? false)),
  );

  const mainItems = visible.filter((item) => item.section !== "bottom");
  const bottomItems = visible.filter((item) => item.section === "bottom");

  return (
    <div className="flex h-full flex-col bg-background p-3">
      {/* Agency Header & Organization Switcher */}
      <div className="flex items-center px-1 pt-1 pb-3" title={agencyName}>
        <OrganizationSwitcher
          hidePersonal={true}
          afterSelectOrganizationUrl="/app"
          afterCreateOrganizationUrl="/app/onboarding"
          afterLeaveOrganizationUrl="/app/onboarding"
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/80 transition-colors text-small font-semibold tracking-tight",
              organizationPreview: "gap-2 min-w-0 flex-1 truncate",
              organizationPreviewTextContainer: "min-w-0 truncate",
              organizationPreviewMainIdentifier: "truncate font-semibold text-small",
            },
          }}
        />
      </div>

      {/* Main Top Navigation */}
      <NavGroup id="sidebar-main">
        <nav
          aria-label={t("a11y.mainNavigation")}
          className="flex flex-col gap-0.5 overflow-y-auto"
        >
          {mainItems.map((item) => {
            const Glyph = ICONS[item.icon];
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // `relative` and `isolate` scope the travelling highlight to
                  // this row: it is positioned absolutely and sits at -z-10, so
                  // without a stacking context of its own it would slide behind
                  // the sidebar background instead of behind the label.
                  "relative isolate flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small font-medium transition-colors max-sm:py-2.5",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? <ActiveHighlight layoutId="sidebar-main-active" /> : null}
                <Glyph />
                {item.label}
                <LinkPending />
              </Link>
            );
          })}
        </nav>
      </NavGroup>

      {/* Bottom Pinned Navigation & Usage Meter */}
      <div className="mt-auto flex flex-col gap-2 pt-3">
        {bottomItems.length > 0 ? (
          /*
           * ⚠️ ITS OWN GROUP AND ITS OWN `layoutId`. Sharing the main nav's id
           * would make the highlight fly the full height of the sidebar when
           * moving between Dashboard and Settings — a long diagonal journey
           * across a visual divider that reads as a glitch rather than a
           * transition. Two regions, two indicators.
           */
          <NavGroup id="sidebar-bottom">
            <nav
              aria-label={t("a11y.secondaryNavigation")}
              className="flex flex-col gap-0.5 border-t border-border/80 pt-2.5"
            >
              {bottomItems.map((item) => {
                const Glyph = ICONS[item.icon];
                const active = isActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative isolate flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small font-medium transition-colors max-sm:py-2.5",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <ActiveHighlight layoutId="sidebar-bottom-active" />
                    ) : null}
                    <Glyph />
                    {item.label}
                    <LinkPending />
                  </Link>
                );
              })}
            </nav>
          </NavGroup>
        ) : null}

        {websiteLimit !== null ? (
          <div className="border-t border-border/80 px-2.5 pt-3 pb-1">
            <p className="mb-1.5 text-caption text-muted-foreground">
              <span className="font-semibold text-foreground">
                {formatNumber(websitesUsed)} / {formatNumber(websiteLimit)}
              </span>{" "}
              {t("shell.websitesUsed")}
            </p>
            <div
              className="h-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={websitesUsed}
              aria-valuemin={0}
              aria-valuemax={websiteLimit}
              aria-label={t("shell.websitesUsed")}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${Math.min(100, (websitesUsed / Math.max(1, websiteLimit)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
