import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { PLAN_CATALOGUE } from "@pdm/billing";
import { PricingTable } from "@/components/marketing/pricing-table";
import { buttonClasses } from "@/components/ui/button";

/**
 * `/pricing` — PLAN.md §3.2, §9.3, Phase 6 task 6.4.
 *
 * ⚠️ STATICALLY PRERENDERED. The prices come from `@pdm/billing`'s catalogue —
 * a constant, not a database read — so the busiest public URL in the product
 * serves from the edge cache with no Postgres round trip and no request-time
 * work. The interval and currency controls are a client island for the same
 * reason (see `PricingTable`).
 *
 * ⚠️ THE COPY MAY NOT PROMISE A LEGAL OUTCOME. §1.11/§1.12: this is a technical
 * monitoring service. A pricing page is the single most tempting surface in the
 * product on which to claim one, and `scripts/check-terminology.ts` fails the
 * build if anyone does — including in a comment like this one, which is how
 * this sentence came to be phrased the long way round.
 */
export const metadata: Metadata = {
  title: t("pricing.title"),
  description: t("pricing.subheadline"),
};

const FAQ = [
  { q: t("pricing.faq1Q"), a: t("pricing.faq1A") },
  { q: t("pricing.faq2Q"), a: t("pricing.faq2A") },
  { q: t("pricing.faq3Q"), a: t("pricing.faq3A") },
  { q: t("pricing.faq4Q"), a: t("pricing.faq4A") },
  { q: t("pricing.faq5Q"), a: t("pricing.faq5A") },
  { q: t("pricing.faq6Q"), a: t("pricing.faq6A") },
  { q: t("pricing.faq7Q"), a: t("pricing.faq7A") },
  { q: t("pricing.faq8Q"), a: t("pricing.faq8A") },
  { q: t("pricing.faq9Q"), a: t("pricing.faq9A") },
  { q: t("pricing.faq10Q"), a: t("pricing.faq10A") },
];

/**
 * §3.2: "SEO: JSON-LD `Product` + `Offer` per plan."
 *
 * ⚠️ USD ONLY, AND THAT IS CORRECT. §9.3 bills in USD; the display currencies
 * are a convenience. Emitting three `Offer`s per plan would tell a search
 * engine we sell the same product at three different prices, which is both
 * wrong and the sort of thing that gets rich results suppressed.
 */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": PLAN_CATALOGUE.map((plan) => ({
      "@type": "Product",
      name: `${t("app.name")} — ${plan.name}`,
      description: plan.description,
      offers: {
        "@type": "Offer",
        price: (plan.prices.usd.monthly / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    })),
  };
}

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // The payload is built from a local constant, never from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />

      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-display tracking-tight text-balance">
            {t("pricing.headline")}
          </h1>
          <p className="mt-4 text-body-lg text-muted-foreground">
            {t("pricing.subheadline")}
          </p>
        </div>

        <div className="mt-12">
          <PricingTable />
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2">
          <div>
            <h2 className="text-h2 tracking-tight">{t("pricing.usageTitle")}</h2>
            <p className="mt-3 text-body-lg text-muted-foreground">
              {t("pricing.usageBody")}
            </p>
          </div>
          <div>
            <h2 className="text-h2 tracking-tight">{t("pricing.whiteLabelTitle")}</h2>
            <p className="mt-3 text-body-lg text-muted-foreground">
              {t("pricing.whiteLabelBody")}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <h2 className="text-h2 tracking-tight">{t("pricing.faqTitle")}</h2>
        {/*
          ⚠️ NATIVE `<details>`, NOT AN ACCORDION COMPONENT. This page is
          prerendered and the FAQ is the part a search engine indexes; a
          JavaScript accordion hides the answers from a crawler that does not
          run scripts and from any visitor whose JS failed. `<details>` opens
          with no JS at all and is keyboard-accessible by construction.
        */}
        <div className="mt-6 flex flex-col divide-y divide-border border-y border-border">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 text-muted-foreground transition group-open:rotate-90">
                    ›
                  </span>
                  {item.q}
                </span>
              </summary>
              <p className="mt-2 pl-5 text-body text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-24 text-center">
        <h2 className="text-h1 tracking-tight text-balance">{t("pricing.ctaTitle")}</h2>
        <p className="mt-3 text-body-lg text-muted-foreground">{t("pricing.ctaBody")}</p>
        <div className="mt-6 flex justify-center">
          <Link href="/signup" className={buttonClasses("primary", "md")}>
            {t("pricing.startTrial")}
          </Link>
        </div>
      </section>
    </>
  );
}
