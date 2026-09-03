import { ChevronRightIcon } from "@/components/ui/icons";
import { Reveal, Stagger } from "@/components/marketing/motion";
import {
  Container,
  CtaSection,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/section";
import { Faq } from "@/components/marketing/faq";
import type { Industry } from "@content/marketing/industries";

/**
 * INDUSTRY PAGE — shared render for /solutions/[industry].
 *
 * Statically generated at build time for every Industry.slug. The template
 * fills around real, industry-specific content — tracking stack, pain points,
 * example findings, FAQ — never the reverse (no doorway pages).
 */
export function IndustryPage({ industry }: { industry: Industry }) {
  return (
    <>
      {/* HERO */}
      <Section className="pb-12 md:pb-16">
        <Container narrow>
          <Reveal>
            <Eyebrow>{industry.shortName}</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-display">
              {industry.hero.title}
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">
              {industry.hero.subtitle}
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* TRACKING STACK */}
      <Section>
        <Container narrow>
          <SectionHeading
            eyebrow="Common tracking stack"
            heading="What a typical site in this industry loads"
            intro="Every industry has a different third-party surface area. Here is what shows up on the sites agencies are responsible for."
            center={false}
          />
          <Stagger className="mt-8">
            {industry.trackingStack.map((item, index) => (
              <Reveal key={item} delay={index * 0.04}>
                <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold"
                  >
                    {index + 1}
                  </span>
                  <p className="text-body">{item}</p>
                </div>
              </Reveal>
            ))}
          </Stagger>
        </Container>
      </Section>

      {/* PAIN POINTS */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="The challenge"
            heading="Why monitoring matters here"
            center={false}
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {industry.painPoints.map((point, index) => (
              <Reveal key={point.title} delay={index * 0.08}>
                <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <h3 className="text-h4">{point.title}</h3>
                  <p className="mt-2 flex-1 text-body text-muted-foreground">
                    {point.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* WHY AUDITS FAIL */}
      <Section>
        <Container narrow>
          <SectionHeading
            eyebrow="Why audits fall short"
            heading="One-off audits do not scale to this portfolio"
            center={false}
          />
          <Reveal delay={0.05}>
            <p className="mt-3 max-w-3xl text-body-lg text-muted-foreground">
              {industry.whyAuditsFail}
            </p>
          </Reveal>
        </Container>
      </Section>

            {/* WORKFLOW */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="How it works"
            heading="Agent workflow for this industry"
            center={false}
          />
          <div className="mt-10 space-y-4">
            {industry.workflow.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.06}>
                <div className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-caption font-semibold text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-h4">{step.title}</h3>
                    <p className="mt-1 text-body text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* EXAMPLE FINDINGS */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Example findings"
            heading="Real drift scenarios this industry encounters"
            center={false}
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {industry.examples.map((example, index) => (
              <Reveal key={example.title} delay={index * 0.08}>
                <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <h3 className="text-h4">{example.title}</h3>
                  <p className="mt-2 flex-1 text-body text-muted-foreground">
                    {example.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* CAPABILITIES + AGENCY WORKFLOW */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHeading
                eyebrow="Technical capabilities"
                heading="What the scanner records for you"
                center={false}
                as="h3"
              />
              <Reveal delay={0.05}>
                <ul className="mt-6 space-y-2 text-body text-muted-foreground">
                  {industry.capabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-2">
                      <ChevronRightIcon
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {cap}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div>
              <SectionHeading
                eyebrow="Agency workflow"
                heading="Packaging into care plans"
                center={false}
                as="h3"
              />
              <Reveal delay={0.05}>
                <p className="mt-0 text-body-lg text-muted-foreground">
                  {industry.agencyWorkflow}
                </p>
              </Reveal>
            </div>
          </div>
        </Container>
      </Section>

      {/* INDUSTRY-SPECIFIC FAQ */}
      <Section>
        <Container narrow>
          <Faq
            eyebrow="Questions"
            heading={`Questions about ${industry.shortName.toLowerCase()} monitoring`}
            items={industry.faqs}
          />
        </Container>
      </Section>

      {/* CTA */}
      <CtaSection
        title={industry.cta.title}
        body={industry.cta.body}
        primary={{ href: "/free-scanner", label: "Run a free scan" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </>
  );
}
