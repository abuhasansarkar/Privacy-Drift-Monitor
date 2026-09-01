import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { FreeScanForm } from "@/components/free-scanner/scan-form";
import {
  ActivityIcon,
  CalendarIcon,
  CheckIcon,
  GlobeIcon,
  ShieldIcon,
  SparkleIcon,
} from "@/components/ui/icons";

/**
 * PUBLIC HOMEPAGE — §3.2, Phase 1 task 1.13.
 *
 * Chrome (skip link, header, footer, the §1.11 boundary statement) lives in
 * `(marketing)/layout.tsx`; this file is content only. The page is STATICALLY
 * PRERENDERED — it calls no `cookies()` / `headers()`, and the header's auth
 * controls are a client island (`MarketingAuthLinks`).
 */
export default function Home() {
  const steps = [
    t("marketing.step1"),
    t("marketing.step2"),
    t("marketing.step3"),
    t("marketing.step4"),
  ];

  const cmps = [
    "Google Consent Mode v2",
    "Cookiebot",
    "OneTrust",
    "Usercentrics",
    "Klaro",
    "Termly",
    "Didomi",
  ];

  return (
    <>
      {/*
        HERO SECTION — Inspired by the high-impact Cookiebot reference (Image 2)
        using our dark/light tokens, primary blue, and refined typography.
      */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/5 via-background to-background py-16 md:py-24">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-full max-w-5xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="mx-auto w-full max-w-5xl px-4 text-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-caption font-semibold uppercase tracking-wider text-primary">
            <SparkleIcon className="size-3.5" />
            {t("marketing.heroEyebrow")}
          </div>

          {/* Main Headline */}
          <h1 className="mx-auto mt-6 max-w-4xl text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl text-balance">
            {t("marketing.heroTitle")}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-3xl text-body-lg text-muted-foreground sm:text-lg text-balance">
            {t("marketing.heroSubtitle")}
          </p>

          {/* Interactive URL Scanner Form + Quick Actions */}
          <div className="mx-auto mt-10 max-w-2xl">
            <FreeScanForm
              variant="hero"
              placeholder="Enter client website URL (e.g. acme-agency.com)"
              buttonText="Scan website"
              hideDisclaimer
            />
            <p className="mt-2 text-caption text-muted-foreground">
              {t("freeScanner.disclaimer")}
            </p>
          </div>

          {/* Trust Badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-caption font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-4 text-primary" />
              {t("marketing.badgeTrial")}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon className="size-4 text-success" />
              {t("marketing.badgeCancel")}
            </span>
            <span className="flex items-center gap-1.5">
              <ActivityIcon className="size-4 text-primary" />
              {t("marketing.badgeMonitoring")}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldIcon className="size-4 text-info" />
              {t("marketing.badgeNoCard")}
            </span>
          </div>

          {/* CMP & Tag Manager Support Badges */}
          <div className="mt-12 pt-8 border-t border-border/60">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              {t("marketing.trustedCmpTitle")}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {cmps.map((cmp) => (
                <span
                  key={cmp}
                  className="inline-flex items-center rounded-md border border-border bg-card/60 px-2.5 py-1 text-caption font-medium text-foreground/80 shadow-xs"
                >
                  {cmp}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Browser Mockup Container */}
        <div className="mx-auto mt-14 w-full max-w-4xl px-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            {/* Mockup Browser Chrome */}
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-red-400/80" />
                <div className="size-3 rounded-full bg-amber-400/80" />
                <div className="size-3 rounded-full bg-green-400/80" />
              </div>
              <div className="flex max-w-md flex-1 items-center justify-center px-4">
                <div className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                  <GlobeIcon className="size-3.5 text-primary" />
                  <span>https://client-store.com/checkout</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <span className="inline-block size-2 rounded-full bg-success animate-pulse" />
                <span>Automated scan</span>
              </div>
            </div>

            {/* Mockup Viewport Body */}
            <div className="grid gap-6 p-6 sm:grid-cols-3 bg-card">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-caption font-medium text-muted-foreground">
                  NO CONSENT JOURNEY
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-small font-semibold text-success">
                  <CheckIcon className="size-4" />
                  <span>0 trackers before consent</span>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">
                  Scripts blocked until user choice
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-caption font-medium text-muted-foreground">
                  REJECT ALL JOURNEY
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-small font-semibold text-success">
                  <CheckIcon className="size-4" />
                  <span>Reject signal respected</span>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">
                  No marketing cookies written
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-caption font-medium text-muted-foreground">
                  DRIFT DETECTION
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-small font-semibold text-warning">
                  <ActivityIcon className="size-4" />
                  <span>+1 new tag this morning</span>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">
                  Alert sent to agency Slack
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works steps */}
      <section className="mx-auto w-full max-w-4xl px-4 py-20">
        <h2 className="text-center text-h2 tracking-tight">
          {t("marketing.stepsTitle")}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step}
              className="rounded-lg border border-border bg-card p-5"
            >
              <span className="font-mono text-caption font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 font-medium text-body">{step}</p>
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
