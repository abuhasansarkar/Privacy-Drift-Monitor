import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { DISCLAIMER_SHORT } from "@pdm/shared/copy/terminology";
import { SiteHeader } from "@/components/site-header";

/**
 * PUBLIC HOMEPAGE — §3.2.
 *
 * This replaces the create-next-app template. It is deliberately a skeleton:
 * the full page (hero screenshot, problem cards, benefits, social proof,
 * pricing teaser) is Phase 1 task 1.13. What matters now is that the public
 * surface owns its own chrome instead of inheriting it from the root layout,
 * and that the boundary statement is present.
 *
 * This page itself calls no `cookies()` / `headers()`. It is NOT yet statically
 * prerendered though: `SiteHeader` renders Clerk's `<Show>`, which resolves auth
 * state on the server and opts the route into dynamic rendering. §3.2 wants
 * marketing pages static, so when `(marketing)/layout.tsx` lands the auth
 * controls should move into a small `"use client"` island that reads
 * `useAuth()`, leaving the rest of the page prerenderable.
 *
 * TODO(1.13): move this file to `src/app/(marketing)/page.tsx` with a
 * `(marketing)/layout.tsx` that owns `SiteHeader` and the footer. That needs a
 * `git mv` — see dev-doc/phases/phase-0-foundation.md task 0.11.
 */
export default function Home() {
  const steps = [
    t("marketing.step1"),
    t("marketing.step2"),
    t("marketing.step3"),
    t("marketing.step4"),
  ];

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        {t("nav.skipToContent")}
      </a>

      <SiteHeader />

      <main id="main" className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-4 py-24">
          <h1 className="max-w-2xl text-3xl font-semibold leading-10 tracking-tight">
            {t("marketing.heroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
            {t("marketing.heroSubtitle")}
          </p>

          {/*
            Only the trial CTA for now. §3.2 also specifies a "Scan a website
            free" secondary CTA, but `/free-scanner` is Phase 6 — shipping a
            button to a 404 is worse than shipping one button.
          */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              {t("marketing.primaryCta")}
            </Link>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 pb-24">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("marketing.stepsTitle")}
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li
                key={step}
                className="rounded-lg border border-border bg-card p-4"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-1 font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </section>
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
