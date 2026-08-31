"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";

/**
 * WEBSITE DETAIL TABS — §3.6, UI_DESIGN_PROMPTS §5.6–§5.11, Phase 3 task 3.10.
 *
 * ⚠️ REAL ROUTES, NOT CLIENT STATE. Each tab is its own URL, so a tab is
 * linkable, back-navigable and bookmarkable — the same reason list filters are
 * URL-serialised (§3.6). "Send me the cookies tab for acme.co.uk" has to be a
 * link, not an instruction.
 *
 * A consequence worth knowing: each tab loads its own data on the server, so a
 * heavy tab costs nothing until it is opened.
 */

const TABS = [
  { segment: "", label: t("websiteTabs.overview") },
  { segment: "issues", label: t("issues.title") },
  { segment: "trackers", label: t("websiteTabs.trackers") },
  { segment: "cookies", label: t("websiteTabs.cookies") },
  { segment: "consent", label: t("websiteTabs.consent") },
  { segment: "changes", label: t("websiteTabs.changes") },
  { segment: "scans", label: t("websiteTabs.scans") },
  { segment: "evidence", label: t("evidence.title") },
  { segment: "reports", label: t("reports.title") },
];

export function WebsiteTabs({ websiteId }: { websiteId: string }) {
  const pathname = usePathname();
  const base = `/app/websites/${websiteId}`;

  return (
    <nav
      aria-label={t("websiteTabs.label")}
      // Scrolls horizontally on a phone rather than wrapping into two rows,
      // which would push the content below the fold on every tab.
      className="-mx-1 overflow-x-auto border-b border-border px-1"
    >
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          // Exact match for Overview; prefix for the rest, so a scan detail
          // page keeps the Scans tab marked active.
          const active = tab.segment
            ? pathname.startsWith(href)
            : pathname === base;

          return (
            <li key={tab.segment || "overview"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2.5 text-small font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
