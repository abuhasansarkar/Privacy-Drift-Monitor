"use client";

import { UserButton } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import type { AgencyRole } from "@pdm/shared/permissions";
import { BellIcon, MenuIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

/**
 * APP SHELL — §3.3, Phase 1 task 1.3.
 *
 * RESPONSIVE POSTURE
 *   >= lg  a 220px sidebar rail beside the content.
 *   <  lg  the rail becomes an off-canvas drawer behind a menu button, and the
 *          header collapses the search field to an icon.
 *
 * The drawer is a Client Component (it holds open/closed state); everything it
 * renders inside is passed down as props from the server layout, so no tenant
 * resolution reaches the browser.
 *
 * ⚠️ Cosmetic only. The shell hides what a role cannot use, but every page and
 * every Server Action behind it re-checks with `requirePermission()` — Next 16's
 * proxy does not reliably cover Server Actions (§6.1).
 */
export function AppShell({
  role,
  agencyName,
  websitesUsed,
  websiteLimit,
  unreadNotifications,
  children,
}: {
  role: AgencyRole;
  agencyName: string;
  websitesUsed: number;
  websiteLimit: number | null;
  unreadNotifications: number;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  /*
   * Closing on navigation is the Sidebar's `onNavigate` below, NOT an effect on
   * `usePathname()`. The drawer closes because the user tapped a link — that is
   * an event, and driving it from a pathname effect meant a synchronous
   * setState in an effect body, which cascades an extra render for every
   * navigation in the app (react-hooks/set-state-in-effect).
   */

  // Escape closes it — the drawer is modal while open, so it needs a keyboard exit.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-svh bg-canvas">
      {/* Desktop rail */}
      <aside className="w-56 shrink-0 border-r border-border max-lg:hidden">
        <div className="sticky top-0 h-svh">
          <Sidebar
            role={role}
            agencyName={agencyName}
            websitesUsed={websitesUsed}
            websiteLimit={websiteLimit}
          />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("shell.closeMenu")}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-foreground/40"
          />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] border-e border-border shadow-xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t("shell.closeMenu")}
              className="absolute end-2 top-2 z-10 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <XIcon />
            </button>
            <Sidebar
              role={role}
              agencyName={agencyName}
              websitesUsed={websitesUsed}
              websiteLimit={websiteLimit}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("shell.openMenu")}
            aria-expanded={drawerOpen}
            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground lg:hidden"
          >
            <MenuIcon />
          </button>

          {/* Full field from sm up; an icon button below it. */}
          <button
            type="button"
            className="ms-auto flex h-9 items-center gap-2 rounded-md border border-border px-3 text-small text-muted-foreground transition-colors hover:text-foreground max-md:hidden lg:w-64"
          >
            <SearchIcon />
            <span className="truncate">{t("shell.search")}</span>
            <kbd className="ms-auto rounded border border-border px-1.5 py-0.5 font-mono text-[11px] max-lg:hidden">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            aria-label={t("shell.searchShort")}
            className="ms-auto grid size-9 place-items-center rounded-md border border-border text-muted-foreground md:hidden"
          >
            <SearchIcon />
          </button>

          <div className="max-sm:hidden">
            <ThemeToggle />
          </div>

          <button
            type="button"
            aria-label={t("shell.notifications")}
            className="relative grid size-9 place-items-center rounded-md border border-border text-muted-foreground"
          >
            <BellIcon />
            {unreadNotifications > 0 ? (
              <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-background" />
            ) : null}
          </button>

          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </header>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
