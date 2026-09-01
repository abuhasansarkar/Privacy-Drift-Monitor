import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { DISCLAIMER_SHORT } from "@pdm/shared/copy/terminology";
import { buttonClasses } from "@/components/ui/button";

/**
 * `/about` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ THE BOUNDARY SECTION IS NOT BOILERPLATE. §1.11 draws a hard line around
 * what this product claims, and an About page is where a company's ambitions
 * usually get written in the widest possible terms. Saying plainly what we are
 * not — here, on the page about who we are — is cheaper than correcting the
 * impression later.
 */
export const metadata: Metadata = {
  title: t("marketingPages.aboutTitle"),
  description: t("marketingPages.aboutLead"),
};

export default function AboutPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketingPages.aboutTitle")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("marketingPages.aboutLead")}
      </p>

      <div className="mt-12 flex flex-col gap-10">
        <section>
          <h2 className="text-h2 tracking-tight">{t("marketingPages.aboutWhyTitle")}</h2>
          <p className="mt-3 text-body text-muted-foreground">
            {t("marketingPages.aboutWhyBody")}
          </p>
        </section>

        <section>
          <h2 className="text-h2 tracking-tight">{t("marketingPages.aboutHowTitle")}</h2>
          <p className="mt-3 text-body text-muted-foreground">
            {t("marketingPages.aboutHowBody")}
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-h3 tracking-tight">
            {t("marketingPages.aboutBoundaryTitle")}
          </h2>
          <p className="mt-3 text-body text-muted-foreground">
            {t("marketingPages.aboutBoundaryBody")}
          </p>
          <p className="mt-3 text-small text-muted-foreground">{DISCLAIMER_SHORT}</p>
        </section>

        <section>
          <h2 className="text-h2 tracking-tight">
            {t("marketingPages.aboutContactTitle")}
          </h2>
          <p className="mt-3 text-body text-muted-foreground">
            {t("marketingPages.aboutContactBody")}
          </p>
          <Link href="/contact" className={buttonClasses("secondary", "md", "mt-4")}>
            {t("marketingPages.contactTitle")}
          </Link>
        </section>
      </div>
    </section>
  );
}
