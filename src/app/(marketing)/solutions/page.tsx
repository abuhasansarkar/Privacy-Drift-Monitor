import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Reveal, Stagger } from "@/components/marketing/motion";
import {
  Container,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/section";
import { INDUSTRIES, SOLUTIONS_INDEX } from "@content/marketing/industries";

/**
 * /solutions — the index of industry-specific monitoring pages.
 *
 * Each card links to a genuinely unique page; the brief forbids doorway pages,
 * so the content lives in `content/marketing/industries.ts` with distinct
 * tracking stacks, pain points, example findings and FAQs per industry.
 */
export const metadata: Metadata = pageMetadata({
  title: SOLUTIONS_INDEX.title,
  description: SOLUTIONS_INDEX.subtitle,
  path: "/solutions",
});

export default function SolutionsPage() {
  return (
    <>
      <Section className="pb-12 md:pb-16">
        <Container narrow>
          <Reveal>
            <Eyebrow>Solutions</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-display">
              {SOLUTIONS_INDEX.title}
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">
              {SOLUTIONS_INDEX.subtitle}
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="By industry"
            heading="Monitoring built around agency portfolios"
            intro="Each page below describes the tracking stack, the typical failure mode, and the agency workflow that fits that industry."
            center={false}
          />
          <Stagger className="mt-10">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry, index) => (
                <Reveal key={industry.slug} delay={index * 0.06}>
                  <Link
                    href={`/solutions/${industry.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <h3 className="text-h3">{industry.name}</h3>
                    <p className="mt-2 flex-1 text-body text-muted-foreground">
                      {industry.pain}
                    </p>
                    <p className="mt-3 flex items-center gap-1 text-small font-medium text-primary">
                      How monitoring helps
                      <ChevronRightIcon
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </Stagger>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <p className="text-body-lg text-muted-foreground">
            Not seeing your industry?{" "}
            <Link
              href="/contact"
              className="text-primary hover:underline"
            >
              Talk to us
            </Link>
            {" "}about monitoring requirements for your portfolio.
          </p>
        </Container>
      </Section>
    </>
  );
}
