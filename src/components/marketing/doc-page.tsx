import { CtaSection, Container, Section } from "./section";

/**
 * DOC PAGE — the shared layout for `/methodology`, `/security`, `/integrations`
 * and `/bot`: a headline, an honest subtitle, flowing sections, and one CTA.
 *
 * Server component: these pages are statically prerendered trust assets.
 */

export interface DocSection {
  heading: string;
  body: readonly string[];
}

export interface DocPageContent {
  title: string;
  subtitle: string;
  sections: readonly DocSection[];
  /** Optional disclaimer line, rendered in a bordered panel at the end. */
  disclaimer?: string;
  cta?: { href: string; label: string; title?: string; body?: string };
}

export function DocPage({ content }: { content: DocPageContent }) {
  return (
    <>
      <Section className="pb-8 md:pb-10">
        <Container narrow>
          <h1 className="text-balance text-3xl font-bold tracking-tight md:text-display">
            {content.title}
          </h1>
          <p className="mt-4 text-body-lg text-muted-foreground">{content.subtitle}</p>
        </Container>
      </Section>

      <Section className="pt-4 md:pt-6">
        <Container narrow>
          <div className="flex flex-col gap-10">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-h2 tracking-tight">{section.heading}</h2>
                {section.body.map((paragraph, index) => (
                  <p key={index} className="mt-3 text-body-lg text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            {content.disclaimer ? (
              <aside className="rounded-lg border border-border bg-card p-5">
                <p className="text-small text-muted-foreground">{content.disclaimer}</p>
              </aside>
            ) : null}
          </div>
        </Container>
      </Section>

      {content.cta ? (
        <CtaSection
          title={content.cta.title ?? content.title}
          body={content.cta.body}
          primary={content.cta}
        />
      ) : null}
    </>
  );
}