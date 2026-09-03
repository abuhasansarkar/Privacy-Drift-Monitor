"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HEADER_LINKS, HEADER_NAV } from "@content/marketing/nav";
import { t } from "@pdm/shared/copy";
import { ChevronRightIcon, MenuIcon } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MarketingAuthLinks } from "@/components/marketing-auth-links";
import { cn } from "@/lib/cn";

/**
 * MARKETING HEADER — sticky, blur-backed, border on scroll, dropdowns on
 * desktop, Sheet drawer on mobile.
 *
 * ⚠️ THIS WHOLE THING IS A CLIENT ISLAND INSIDE A STATIC PAGE (see
 * `(marketing)/layout.tsx`): scroll state and menu state are browser state.
 * The auth controls stay in their own island so Clerk never makes a marketing
 * page dynamic.
 *
 * ⚠️ DROPDOWNS ARE A HAND-ROLLED DISCLOSURE PATTERN: hover-intent on desktop
 * (pointerenter/leave with a close timer), click/Enter to pin, Escape to
 * close, focus-out closes, route change closes. Hover alone never reveals
 * content keyboard focus cannot reach — every menu also opens on focus-in of
 * its trigger, so keyboard and pointer see the same behaviour (WCAG 2.1.1).
 */

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {t("app.name")}
    </Link>
  );
}

function DesktopDropdown({ group }: { group: (typeof HEADER_NAV)[number] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function cancelClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={scheduleClose}
      onBlur={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1 text-small transition",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {group.label}
        <ChevronRightIcon
          aria-hidden="true"
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
      </button>

      <div
        className={cn(
          "absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-2",
          open ? "block" : "hidden",
        )}
      >
        <div className="rounded-lg border border-border bg-card p-1.5 shadow-lg">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md p-2.5 transition hover:bg-muted"
            >
              <span className="block text-small font-medium">{item.label}</span>
              {item.description ? (
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Hairline border + firmer background only once the page scrolls; the
  // transition is the only animation here, and the global reduced-motion rule
  // already neutralises it.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer after navigation so back/forward never reopens it.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full backdrop-blur transition-colors",
        scrolled
          ? "border-b border-border bg-background/85"
          : "border-b border-transparent bg-background/60",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />

        <nav aria-label={t("a11y.mainNavigation")} className="hidden items-center gap-6 md:flex">
          {HEADER_NAV.map((group) => (
            <DesktopDropdown key={group.label} group={group} />
          ))}
          {HEADER_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-small text-muted-foreground transition hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <MarketingAuthLinks />
          <Link href="/free-scanner" className={buttonClasses("primary", "md")}>
            Run free scan
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <MarketingAuthLinks />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label={t("a11y.mainNavigation")}
              className={buttonClasses("secondary", "md", "px-2.5")}
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="text-left">{t("app.name")}</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label={t("a11y.mainNavigation")} className="flex flex-col gap-6 px-4 pb-6">
                {HEADER_NAV.map((group) => (
                  <div key={group.label}>
                    <p className="text-caption font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="block rounded-md px-2 py-1.5 text-body transition hover:bg-muted"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  {HEADER_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-md px-2 py-1.5 text-body transition hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link
                    href="/free-scanner"
                    className={buttonClasses("primary", "md", "mt-2 w-full")}
                  >
                    Run free scan
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}