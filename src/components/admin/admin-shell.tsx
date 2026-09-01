"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { ADMIN_GROUPS, ADMIN_NAV, isAdminActive } from "./admin-nav";

/**
 * ADMIN SHELL — PLAN.md §3.12, `UI_DESIGN_PROMPTS.md` §6.
 *
 * ⚠️ IT LOOKS DELIBERATELY DIFFERENT FROM THE CUSTOMER APP — dark rail, an
 * "ADMIN" chip pinned to the top. Feature doc 19 asks for this and the reason
 * is not decoration: an operator with both surfaces open, one of them showing
 * somebody else's data, must never have to read the URL to know which is which.
 * The moment the two look alike is the moment a support note gets typed into a
 * customer's issue.
 *
 * ⚠️ THE NAV IS COSMETIC. Every page behind it calls `requireSuperAdmin()`
 * itself, and so does every route handler — see the note in `server/admin/
 * context.ts` about why the layout is not a boundary.
 */
export function AdminShell({
  adminName,
  children,
}: {
  adminName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh bg-canvas">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-4 overflow-y-auto bg-neutral-900 p-3 text-neutral-200 lg:flex">
        <div className="flex items-center gap-2 px-2 pt-1">
          <span className="rounded bg-danger px-1.5 py-0.5 text-caption font-semibold tracking-wide text-danger-foreground">
            {t("admin.chip")}
          </span>
          <span className="truncate text-small font-medium">{t("app.name")}</span>
        </div>

        <nav aria-label={t("admin.title")} className="flex flex-col gap-4">
          {ADMIN_GROUPS.map((group) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              <p className="px-2 py-1 text-caption uppercase tracking-wide text-neutral-500">
                {group.label}
              </p>
              {ADMIN_NAV.filter((item) => item.group === group.key).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isAdminActive(item.href, pathname) ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-small transition-colors",
                    isAdminActive(item.href, pathname)
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-300 hover:bg-neutral-800 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-neutral-700 px-2 pt-3">
          <span className="text-caption text-neutral-500">{t("admin.signedInAs")}</span>
          <span className="truncate text-caption text-neutral-300">{adminName}</span>
          <Link href="/app" className="mt-1 text-caption text-neutral-400 hover:text-white">
            {t("admin.backToApp")}
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The mobile bar carries the same chip: the distinction must survive a
            narrow viewport, where the dark rail is hidden. */}
        <header className="flex items-center gap-2 border-b border-border bg-neutral-900 px-4 py-2 text-neutral-200 lg:hidden">
          <span className="rounded bg-danger px-1.5 py-0.5 text-caption font-semibold text-danger-foreground">
            {t("admin.chip")}
          </span>
          <span className="text-small">{t("admin.title")}</span>
        </header>

        {/* Horizontal scroller for the nav on narrow screens. */}
        <nav
          aria-label={t("admin.title")}
          className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden"
        >
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-2 py-1 text-caption",
                isAdminActive(item.href, pathname)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
