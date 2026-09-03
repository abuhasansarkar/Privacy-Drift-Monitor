import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { Container, Section, SectionHeading, CtaSection } from "@/components/marketing/section";
import { TechnicalPipeline } from "@/components/marketing/technical-pipeline";
import { ConsentJourneyDemo } from "@/components/marketing/consent-journey";
import { DriftTimeline } from "@/components/marketing/drift-timeline";
import { DemoLabel } from "@/components/marketing/section";
import { FEATURES_PAGE } from "@content/marketing/pages";

/**
 * FEATURES — §3.2, UI_DESIGN_PROMPTS §4.4.
 *
 * ⚠️ Statically prerendered, like every marketing page: nothing here calls
 * `cookies()` or a server-side Clerk helper, and the header's auth controls are
 * a client island for exactly that reason (see `(marketing)/layout.tsx`).
 *
 * ⚠️ Each block describes what the product RECORDS, not what it concludes. The
 * punchier marketing sentence would be a legal-compliance claim, and §1.11
 * forbids us from making one — this is a technical monitoring service.
 */
export const metadata: Metadata = {
  title: t("marketing.featuresTitle"),
  description: t("app.tagline"),
};

export default function FeaturesPage() {
  return (
    <>
      <Section id="runtime">
        <Container>
          <SectionHeading
            eyebrow={FEATURES_PAGE.eyebrow}
            heading={FEATURES_PAGE.title}
            intro={FEATURES_PAGE.subtitle}
            center
            as="h1"
          />
          <div className="mt-14">
            <SectionHeading
              eyebrow={FEATURES_PAGE.sections.runtime}
              heading={t("features.browserTitle")}
              intro={t("features.browserBody")}
            />
            {/*
              `TechnicalPipeline` renders its own illustrative-data label. The
              second `DemoLabel` that used to sit here printed a near-identical
              sentence directly beneath the first.
            */}
            <div className="mt-10">
              <TechnicalPipeline />
            </div>
          </div>
        </Container>
      </Section>

      <Section id="consent">
        <Container>
          <SectionHeading
            eyebrow={FEATURES_PAGE.sections.consent}
            heading={FEATURES_PAGE.consentHeading}
            intro={t("features.consentBody")}
          />
          <div className="mt-12">
            <ConsentJourneyDemo />
          </div>
        </Container>
      </Section>

      <Section id="drift">
        <Container>
          <SectionHeading
            eyebrow={FEATURES_PAGE.sections.drift}
            heading={t("features.driftTitle")}
            intro={t("features.driftBody")}
          />
          <div className="mt-12">
            <DriftTimeline />
            <DemoLabel>{FEATURES_PAGE.captions.driftTimeline}</DemoLabel>
          </div>
        </Container>
      </Section>

      <CtaSection
        title="Ready to see what actually loads on"
        titleAccent="your clients' sites?"
        body="Run a free scan. No account, no credit card."
        primary={{ href: "/free-scanner", label: "Run a free scan" }}
      />
    </>
  );
}
