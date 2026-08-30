import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { DISCLAIMER_SHORT } from "@pdm/shared/copy/terminology";
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
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          {/* §1.11 — the boundary statement appears on every public surface. */}
          <p className="text-xs leading-5 text-muted-foreground">
            {DISCLAIMER_SHORT}
          </p>
        </div>
      </footer>
    </>
  );
}
