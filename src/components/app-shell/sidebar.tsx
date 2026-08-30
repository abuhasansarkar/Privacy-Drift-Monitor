"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can, type AgencyRole } from "@pdm/shared/permissions";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import {
  ActivityIcon,
  AlertCircleIcon,
  DocIcon,
  GlobeIcon,
  GridIcon,
  ShieldIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { isActive, NAV_ITEMS, type NavItem } from "./nav-items";

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
};

export function Sidebar({
  role,
  agencyName,
  websitesUsed,
  websiteLimit,
  onNavigate,
}: {
  role: AgencyRole;
  agencyName: string;
  websitesUsed: number;
  /** Null while entitlements are stubbed — the meter then hides rather than lying. */
  websiteLimit: number | null;
  /** Set by the mobile drawer so tapping a link closes it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter((item) => can(role, item.permission));

  return (
    <div className="flex h-full flex-col gap-4 bg-background p-3">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <ShieldIcon />
        </span>
        <span className="min-w-0 truncate font-semibold tracking-tight">
          {agencyName}
        </span>
      </div>

      <nav aria-label={t("a11y.mainNavigation")} className="flex flex-col gap-0.5">
        {visible.map((item) => {
          const Glyph = ICONS[item.icon];
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small font-medium transition-colors max-sm:py-2.5",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Glyph />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {websiteLimit !== null ? (
        <div className="mt-auto border-t border-border px-2.5 pb-1 pt-3">
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
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, (websitesUsed / Math.max(1, websiteLimit)) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
