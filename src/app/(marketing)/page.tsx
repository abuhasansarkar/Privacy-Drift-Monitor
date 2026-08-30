import Link from "next/link";
import { t } from "@pdm/shared/copy";

/**
 * PUBLIC HOMEPAGE — §3.2.
 *
 * This replaces the create-next-app template. It is deliberately a skeleton:
 * the full page (hero screenshot, problem cards, benefits, social proof,
 * pricing teaser) is Phase 1 task 1.13.
 *
 * Chrome (skip link, header, footer, the §1.11 boundary statement) lives in
 * `(marketing)/layout.tsx`; this file is content only. The page is STATICALLY
 * PRERENDERED — it calls no `cookies()` / `headers()`, and the header's auth
 * controls are a client island (`MarketingAuthLinks`) precisely so they do not
 * drag the route into dynamic rendering, which is what Clerk's server-resolved
 * `<Show>` used to do.
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

      {/*
        §4.2 — the differentiator section. It is the second thing on the page
        because "we scan your site" is a commodity claim; "we tell you what
        CHANGED" is the one this product is built around.
      */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-3xl px-4 py-20">
          <p className="text-caption font-semibold uppercase tracking-wide text-primary">
            {t("marketing.driftEyebrow")}
          </p>
          <h2 className="mt-2 text-h1 tracking-tight text-balance">
            {t("marketing.driftTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">
            {t("marketing.driftBody")}
          </p>

          {/* A concrete diff, not an abstract illustration. */}
          <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            <div className="bg-background p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">
                {t("marketing.driftLastWeek")}
              </p>
              <ul className="mt-3 flex flex-col gap-2 font-mono text-mono text-muted-foreground">
                <li>google-analytics.com</li>
                <li>consent.cookiebot.com</li>
              </ul>
            </div>
            <div className="bg-background p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">
                {t("marketing.driftToday")}
              </p>
              <ul className="mt-3 flex flex-col gap-2 font-mono text-mono">
                <li className="text-muted-foreground">google-analytics.com</li>
                <li className="text-muted-foreground">consent.cookiebot.com</li>
                <li className="rounded bg-warning-muted px-1.5 py-0.5 text-warning">
                  + connect.facebook.net
                </li>
                <li className="rounded bg-severity-critical-bg px-1.5 py-0.5 text-severity-critical">
                  + fires after Reject All
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* §4.3 (2) — the three problems, in the reader's own words. */}
      <section className="mx-auto w-full max-w-5xl px-4 py-20">
        <h2 className="text-h2 tracking-tight">{t("marketing.problemTitle")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [t("marketing.problem1Title"), t("marketing.problem1Body")],
            [t("marketing.problem2Title"), t("marketing.problem2Body")],
            [t("marketing.problem3Title"), t("marketing.problem3Body")],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-h4">{title}</h3>
              <p className="mt-2 text-small text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* §4.3 (4) — benefits. */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 py-20">
          <h2 className="text-h2 tracking-tight">{t("marketing.benefitsTitle")}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              [t("marketing.benefit1Title"), t("marketing.benefit1Body")],
              [t("marketing.benefit2Title"), t("marketing.benefit2Body")],
              [t("marketing.benefit3Title"), t("marketing.benefit3Body")],
            ].map(([title, body]) => (
              <div key={title}>
                <h3 className="text-h4">{title}</h3>
                <p className="mt-2 text-small text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        §4.5's honesty panel, on the homepage rather than only on
        /how-it-works. §1.11's boundary statement belongs where a buyer forms
        their expectation, not in a footer they scroll past.
      */}
      <section className="mx-auto w-full max-w-3xl px-4 py-20">
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-h3">{t("marketing.honestyTitle")}</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <p className="text-small text-muted-foreground">
              {t("marketing.honestyCan")}
            </p>
            <p className="text-small text-muted-foreground">
              {t("marketing.honestyCannot")}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-primary/5">
        <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
          <h2 className="text-h1 tracking-tight text-balance">
            {t("marketing.ctaTitle")}
          </h2>
          <p className="mt-3 text-body-lg text-muted-foreground">
            {t("marketing.ctaBody")}
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {t("marketing.primaryCta")}
          </Link>
        </div>
      </section>
    </>
  );
}
