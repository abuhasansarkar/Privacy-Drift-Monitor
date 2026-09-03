import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { FreeScanForm } from "@/components/free-scanner/scan-form";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon, ChevronRightIcon, XIcon } from "@/components/ui/icons";
import { Reveal, Stagger } from "@/components/marketing/motion";
import {
  Container,
  CtaSection,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/section";
import { TrustBar } from "@/components/marketing/trust-bar";
import { TechnicalPipeline } from "@/components/marketing/technical-pipeline";
import { DriftTimeline } from "@/components/marketing/drift-timeline";
import { ConsentJourneyDemo } from "@/components/marketing/consent-journey";
import {
  AiExplanationCard,
  EvidenceCards,
  PortalPreview,
  ReportPreview,
} from "@/components/marketing/mockups";
import { Faq } from "@/components/marketing/faq";
import { HOMEPAGE_FAQS } from "@content/marketing/faqs";
import { INDUSTRIES, SENSITIVE_DATA_NOTE } from "@content/marketing/industries";
import {
  AGENCY,
  AI,
  COMPARISON,
  CONSENT_JOURNEYS,
  DRIFT,
  FINAL_CTA,
  HERO,
  PIPELINE,
  PORTAL,
  PRICING_PREVIEW,
  PROBLEM,
  SECURITY_TEASER,
  WHITE_LABEL,
} from "@content/marketing/homepage";

/**
 * PUBLIC HOMEPAGE — the primary conversion surface.
 *
 * Chrome lives in `(marketing)/layout.tsx`; this file is content only. The
 * page is STATICALLY PRERENDERED — the only client islands are the scan form,
 * the header and three scroll-animation components, all below the fold or
 * lazy by design.
 *
 * Section order is the conversion argument: understand the product (hero),
 * believe it is real (trust bar, pipeline, evidence), see the differentiator
 * (drift, journeys), imagine it in the agency (workflow, white-label, portal),
 * find your industry, clear the objections (security, pricing, FAQ), act.
 */
export const metadata: Metadata = pageMetadata({
  title: "Continuous privacy monitoring for client websites",
  description: HERO.subtitle,
  path: "/",
});

export default function HomePage() {
  return (
    <>
      {/* 1. HERO — what/who/why in one screen, with the scanner inline. */}
      <section className="relative overflow-hidden border-b border-border py-16 md:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-32 -z-10 mx-auto h-80 max-w-3xl rounded-full bg-primary/10 blur-3xl"
        />
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <Eyebrow>{HERO.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-display">
                {HERO.title}
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mx-auto mt-4 max-w-2xl text-body-lg text-muted-foreground">
                {HERO.subtitle}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mx-auto mt-8 max-w-2xl">
                <FreeScanForm
                  variant="hero"
                  placeholder={HERO.placeholder}
                  buttonText={HERO.scanButton}
                  hideDisclaimer
                />
                <p className="mt-2 text-caption text-muted-foreground">{HERO.formNote}</p>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-6">
                <Link
                  href={HERO.secondaryCta.href}
                  className="text-small font-medium text-primary hover:underline"
                >
                  {HERO.secondaryCta.label}
                  <ChevronRightIcon aria-hidden="true" className="ml-0.5 inline size-3.5" />
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* 2. Trust bar — product signals, no fabricated logos. */}
      <TrustBar />

      {/* 3. PROBLEM — framing, not fear. */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow={PROBLEM.eyebrow}
            heading={PROBLEM.heading}
            intro={PROBLEM.intro}
          />
          <Stagger className="mt-10 flex flex-col gap-3 md:flex-row md:items-stretch">
            {PROBLEM.chain.map((step, index) => (
              <div
                key={step}
                className="flex flex-1 items-start gap-2 rounded-lg border border-border bg-card p-3 text-small"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold text-muted-foreground"
                >
                  {index + 1}
                </span>
                {step}
              </div>
            ))}
          </Stagger>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROBLEM.cards.map((card, index) => (
              <Reveal key={card.title} delay={index * 0.08}>
                <div className="h-full rounded-lg border border-border bg-card p-5">
                  <h3 className="text-h4">{card.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{card.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* 4. WHY ONE-OFF SCANS MISS IT — categories, not named competitors. */}
      <Section bordered>
        <Container>
          <SectionHeading eyebrow={COMPARISON.eyebrow} heading={COMPARISON.heading} />
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-lg border border-border bg-background p-5">
                <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  <XIcon aria-hidden="true" className="size-3.5" />
                  {COMPARISON.snapshot.title}
                </p>
                <ol className="mt-4 flex flex-col gap-2 text-small text-muted-foreground">
                  {COMPARISON.snapshot.steps.map((step) => (
                    <li key={step} className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border"
                      />
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="h-full rounded-lg border border-primary/30 bg-background p-5 shadow-sm">
                <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-primary">
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                  {COMPARISON.monitor.title}
                </p>
                <ol className="mt-4 flex flex-col gap-2 text-small">
                  {COMPARISON.monitor.steps.map((step) => (
                    <li key={step} className="flex items-start gap-2">
                      <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          </div>
          <div className="mx-auto mt-6 max-w-4xl overflow-hidden rounded-lg border border-border">
            <table className="w-full text-small">
              <caption className="sr-only">Snapshot tools versus continuous monitoring</caption>
              <tbody className="divide-y divide-border">
                {COMPARISON.rows.map((row) => (
                  <tr key={row.from}>
                    <th
                      scope="row"
                      className="px-4 py-2.5 text-left font-normal text-muted-foreground"
                    >
                      {row.from}
                    </th>
                    <td className="px-4 py-2.5 text-left font-medium">{row.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      {/* 5. HOW IT WORKS — the animated six-stage pipeline. */}
      <Section id="pipeline">
        <Container>
          <SectionHeading eyebrow={PIPELINE.eyebrow} heading={PIPELINE.heading} intro={PIPELINE.intro} />
          <div className="mt-12">
            <TechnicalPipeline />
          </div>
          <p className="mt-8 text-center text-small text-muted-foreground">
            The full six-stage walkthrough, with the honesty panel, is on{" "}
            <Link href="/how-it-works" className="text-primary hover:underline">
              how it works
            </Link>
            .
          </p>
        </Container>
      </Section>

      {/* 6. PRIVACY DRIFT — the differentiator. */}
      <Section id="drift" bordered>
        <Container>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                eyebrow={DRIFT.eyebrow}
                heading={DRIFT.heading}
                intro={DRIFT.intro}
                center={false}
              />
              <div className="mt-6 flex flex-wrap gap-3 text-small">
                <Link href="/how-it-works" className={buttonClasses("secondary", "md")}>
                  How drift detection works
                </Link>
                <Link href="/free-scanner" className={buttonClasses("ghost", "md")}>
                  See it on your site
                </Link>
              </div>
            </div>
            <DriftTimeline />
          </div>
        </Container>
      </Section>

      {/* 7. CONSENT JOURNEYS — interactive demo. */}
      <Section id="consent-journeys">
        <Container>
          <SectionHeading
            eyebrow={CONSENT_JOURNEYS.eyebrow}
            heading={CONSENT_JOURNEYS.heading}
            intro={CONSENT_JOURNEYS.intro}
          />
          <div className="mx-auto mt-10 max-w-5xl rounded-xl border border-border bg-card p-4 md:p-6">
            <ConsentJourneyDemo />
          </div>
        </Container>
      </Section>

      {/* 8. EVIDENCE — technical proof, labelled demo data. */}
      <Section bordered>
        <Container>
          <SectionHeading
            eyebrow="Technical proof"
            heading="Every finding traces back to a recorded event"
          />
          <div className="mt-10">
            <EvidenceCards />
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-small text-muted-foreground">
            Evidence is recorded per consent journey — the request, the state it
            fired under, and the second it happened. The evidence vault behind
            every finding is described on{" "}
            <Link href="/methodology" className="text-primary hover:underline">
              the methodology page
            </Link>
            .
          </p>
        </Container>
      </Section>

      {/* 9. AI — the explanation layer over deterministic findings. */}
      <Section id="ai">
        <Container>
          <SectionHeading eyebrow={AI.eyebrow} heading={AI.heading} intro={AI.intro} />
          <Stagger className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
            {AI.steps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-card px-3 py-1.5 text-small">
                  {step}
                </span>
                {index < AI.steps.length - 1 ? (
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                ) : null}
              </div>
            ))}
          </Stagger>
          <div className="mt-10">
            <AiExplanationCard />
          </div>
        </Container>
      </Section>

      {/* 10. AGENCY WORKFLOW — the product's shape is the agency's shape. */}
      <Section id="agency" bordered>
        <Container>
          <SectionHeading eyebrow={AGENCY.eyebrow} heading={AGENCY.heading} intro={AGENCY.intro} />
          <Stagger className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {AGENCY.steps.map((step, index) => (
              <div key={step.title} className="rounded-lg border border-border bg-background p-3.5">
                <span aria-hidden="true" className="text-caption font-semibold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1 text-small font-semibold">{step.title}</h3>
                <p className="mt-1 text-caption text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </Stagger>
          <p className="mx-auto mt-8 max-w-2xl text-center text-small text-muted-foreground">
            {AGENCY.revenueCopy}
          </p>
        </Container>
      </Section>

      {/* 11. WHITE-LABEL REPORT + CLIENT PORTAL — side-by-side mock-ups. */}
      <Section id="white-label">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHeading
                eyebrow={WHITE_LABEL.eyebrow}
                heading={WHITE_LABEL.heading}
                intro={WHITE_LABEL.intro}
                center={false}
              />
            </div>
            <ReportPreview />
          </div>
          <div className="mt-16 grid items-center gap-10 lg:grid-cols-2">
            <div className="order-last lg:order-first">
              <PortalPreview />
            </div>
            <div>
              <SectionHeading
                eyebrow={PORTAL.eyebrow}
                heading={PORTAL.heading}
                intro={PORTAL.intro}
                center={false}
              />
            </div>
          </div>
        </Container>
      </Section>

      {/* 12. INDUSTRIES — where agencies recognise themselves. */}
      <Section bordered>
        <Container>
          <SectionHeading
            eyebrow="Industries"
            heading="Built for the portfolios agencies actually manage"
            intro="Different stacks, same failure mode: a change nobody made on purpose. Pick your industry for the specific version."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((industry, index) => (
              <Reveal key={industry.slug} delay={index * 0.06}>
                <Link
                  href={`/solutions/${industry.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <h3 className="text-h4">{industry.name}</h3>
                  <p className="mt-2 flex-1 text-small text-muted-foreground">{industry.pain}</p>
                  <p className="mt-3 flex items-center gap-1 text-small font-medium text-primary">
                    How monitoring helps
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </p>
                </Link>
              </Reveal>
            ))}
            <Reveal delay={0.3}>
              <div className="flex h-full flex-col rounded-lg border border-dashed border-border bg-background p-5">
                <h3 className="text-h4">Sensitive-data websites</h3>
                <p className="mt-2 flex-1 text-small text-muted-foreground">{SENSITIVE_DATA_NOTE}</p>
                <Link
                  href="/contact"
                  className="mt-3 text-small font-medium text-primary hover:underline"
                >
                  Talk to us
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* 13. SECURITY & PRIVACY — implemented controls only. */}
      <Section>
        <Container>
          <SectionHeading eyebrow={SECURITY_TEASER.eyebrow} heading={SECURITY_TEASER.heading} />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {SECURITY_TEASER.points.map((point, index) => (
              <Reveal key={point.title} delay={index * 0.06}>
                <div className="h-full rounded-lg border border-border bg-card p-5">
                  <h3 className="text-h4">{point.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link
              href={SECURITY_TEASER.cta.href}
              className="text-small font-medium text-primary hover:underline"
            >
              {SECURITY_TEASER.cta.label}
            </Link>
          </p>
        </Container>
      </Section>

      {/* 14. PRICING PREVIEW — one screen, one click from the real page. */}
      <Section bordered>
        <Container>
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <SectionHeading
                eyebrow={PRICING_PREVIEW.eyebrow}
                heading={PRICING_PREVIEW.heading}
                intro={PRICING_PREVIEW.intro}
                center={false}
              />
            </div>
            <Link href={PRICING_PREVIEW.cta.href} className={buttonClasses("secondary", "md")}>
              {PRICING_PREVIEW.cta.label}
            </Link>
          </div>
        </Container>
      </Section>

      {/* 15. FAQ — the highest-intent objections, with FAQPage JSON-LD. */}
      <Faq eyebrow="FAQ" heading="Questions agencies ask first" items={HOMEPAGE_FAQS} withSchema />

      {/* 16. FINAL CTA. */}
      <CtaSection
        title={FINAL_CTA.title}
        titleAccent={FINAL_CTA.titleAccent}
        body={FINAL_CTA.body}
        primary={FINAL_CTA.primary}
        secondary={FINAL_CTA.secondary}
      />
    </>
  );
}