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
    </>
  );
}
