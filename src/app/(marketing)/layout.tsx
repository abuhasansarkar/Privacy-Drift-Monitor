import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { DISCLAIMER_SHORT } from "@pdm/shared/copy/terminology";
import { LEGAL_DOCUMENTS } from "@content/legal";
import { MarketingAuthLinks } from "@/components/marketing-auth-links";

/**
 * PUBLIC LAYOUT — §3.1, §3.2. Phase 0 task 0.11.
 *
 * One of the four route-group layouts §3.1 requires, each with its own auth
 * posture, kept physically separate "so an unauthenticated page can never
 * accidentally inherit an authenticated shell". This one is the unauthenticated
 * surface: it resolves no tenant context and renders no app chrome.
 *
 * Pages under it stay STATICALLY PRERENDERED. Nothing here calls `cookies()`,
 * `headers()` or a server-side Clerk helper — the only auth-aware piece is
 * `MarketingAuthLinks`, a client island. Adding a server-side auth check to
 * this file would silently make every marketing page dynamic.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        {t("nav.skipToContent")}
      </a>

      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            {t("app.name")}
          </Link>
          <nav
            aria-label={t("a11y.mainNavigation")}
            className="flex items-center gap-3"
          >
            {/* Hidden below sm: on a phone the auth CTA is what matters, and
                four nav links beside it wrap into a second row. */}
            <Link
              href="/features"
              className="text-sm text-muted-foreground transition hover:text-foreground max-sm:hidden"
            >
              {t("nav.features")}
            </Link>
            <Link
              href="/free-scanner"
              className="text-sm text-muted-foreground transition hover:text-foreground max-sm:hidden"
            >
              {t("nav.freeScanner")}
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground transition hover:text-foreground max-sm:hidden"
            >
              {t("nav.pricing")}
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm text-muted-foreground transition hover:text-foreground max-sm:hidden"
            >
              {t("nav.howItWorks")}
            </Link>
            <MarketingAuthLinks />
          </nav>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
          {/* §1.11 — the boundary statement appears on every public surface. */}
          <p className="text-xs leading-5 text-muted-foreground">
            {DISCLAIMER_SHORT}
          </p>

          {/*
            §3.2 requires all four legal documents to be reachable. Linked from
            the footer of every public page rather than buried, because the
            disclaimer above is a summary and this is where the full text lives.
          */}
          {/*
            §3.2's remaining public pages. In the footer rather than the header
            because the header's job on a phone is the auth CTA — see the note
            on the `max-sm:hidden` links above.
          */}
          <nav aria-label={t("marketingPages.resourcesTitle")}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { href: "/resources", label: t("marketingPages.resourcesTitle") },
                { href: "/blog", label: t("marketingPages.blogTitle") },
                { href: "/changelog", label: t("marketingPages.changelogTitle") },
                { href: "/about", label: t("marketingPages.aboutTitle") },
                { href: "/contact", label: t("marketingPages.contactTitle") },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("legal.footerTitle")}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {LEGAL_DOCUMENTS.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/legal/${doc.slug}`}
                    className="text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
