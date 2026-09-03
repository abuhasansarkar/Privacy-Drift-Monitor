import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import Link from "next/link";
import { Container, Section, SectionHeading, CtaSection } from "@/components/marketing/section";
import { TechnicalPipeline } from "@/components/marketing/technical-pipeline";

/**
 * HOW IT WORKS — §3.2, UI_DESIGN_PROMPTS §4.5.
 *
 * A numbered sequence, because the order is the explanation: consent is tested
 * before trackers are classified, and comparison happens after both. A grid of
 * feature cards would lose that, and the ordering is what makes the honesty
 * panel at the end land.
 */
export const metadata: Metadata = {
  title: t("marketing.howItWorksTitle"),
  description: t("app.tagline"),
};

const STAGES = [
  t("howItWorks.stage1"),
  t("howItWorks.stage2"),
  t("howItWorks.stage3"),
  t("howItWorks.stage4"),
  t("howItWorks.stage5"),
  t("howItWorks.stage6"),
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Process"
            heading={t("marketing.howItWorksTitle")}
            intro="A deterministic browser scan across four consent journeys, compared against the last complete scan."
            center
            as="h1"
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="mt-12">
            <TechnicalPipeline />
          </div>
          <ol className="mt-12 flex flex-col gap-6 border-s border-border ps-6">
            {STAGES.map((stage, index) => (
              <li key={stage} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -start-[2.05rem] top-0.5 grid size-6 place-items-center rounded-full bg-primary text-caption font-semibold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <p className="text-body-lg">{stage}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* §4.5's honesty panel — the boundary, stated where a buyer reads it. */}
      <Section>
        <Container>
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-h3">{t("marketing.honestyTitle")}</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <p className="text-small text-muted-foreground">{t("marketing.honestyCan")}</p>
              <p className="text-small text-muted-foreground">
                {t("marketing.honestyCannot")}
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <CtaSection
        title="See it in action"
        titleAccent="with a free scan"
        body="Enter any website and watch what loads before, during, and after consent."
        primary={{ href: "/free-scanner", label: "Run a free scan" }}
        secondary={{ href: "/features", label: "View all features" }}
      />
    </>
  );
}
