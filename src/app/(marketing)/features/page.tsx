import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { Container, Section, SectionHeading, CtaSection } from "@/components/marketing/section";
import { TechnicalPipeline } from "@/components/marketing/technical-pipeline";
import { ConsentJourneyDemo } from "@/components/marketing/consent-journey";
import { DriftTimeline } from "@/components/marketing/drift-timeline";
import { DemoLabel } from "@/components/marketing/section";

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
            eyebrow={t("features.browserTitle")}
            heading={t("features.browserTitle")}
            intro={t("features.browserBody")}
          />
          <div className="mt-12">
            <TechnicalPipeline />
            <DemoLabel>Illustrative scan pipeline, real evidence structure.</DemoLabel>
          </div>
        </Container>
      </Section>

      <Section id="consent">
        <Container>
          <SectionHeading
            eyebrow="Consent journeys"
            heading="Four consent states, four isolated recordings"
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
            eyebrow={t("features.driftTitle")}
            heading="Change detection between scans"
            intro={t("features.driftBody")}
          />
          <div className="mt-12">
            <DriftTimeline />
            <DemoLabel>Illustrative timeline — your scans produce the real one.</DemoLabel>
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
