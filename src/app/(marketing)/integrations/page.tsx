import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container, CtaSection, Eyebrow, Section } from "@/components/marketing/section";
import { INTEGRATIONS } from "@content/marketing/pages";

/**
 * `/integrations` — CMP matrix + alerting/workflow roadmap.
 *
 * ⚠️ STATUS BADGES ARE THE POINT. Roadmap items are labelled Planned — never
 * presented as live. The CMP rows use the honest Supported / Partial /
 * Heuristic taxonomy the resources page uses.
 */
export const metadata: Metadata = pageMetadata({
  title: INTEGRATIONS.title,
  description: INTEGRATIONS.subtitle,
  path: "/integrations",
});

const STATUS_TONE: Record<string, string> = {
  available: "bg-success-muted text-success",
  partial: "bg-warning-muted text-warning",
  heuristic: "bg-info-muted text-info",
  experimental: "bg-warning-muted text-warning",
  "coming-soon": "bg-muted text-muted-foreground",
  planned: "bg-muted text-muted-foreground",
};

export default function IntegrationsPage() {
  return (
    <>
      <Section className="pb-8 md:pb-10">
        <Container narrow>
          <Eyebrow>Integrations</Eyebrow>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight md:text-display">
            {INTEGRATIONS.title}
          </h1>
          <p className="mt-4 text-body-lg text-muted-foreground">{INTEGRATIONS.subtitle}</p>
        </Container>
      </Section>

      <Section className="pt-4 md:pt-6">
        <Container>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[42rem] text-small">
              <caption className="sr-only">Consent platform and workflow integrations</caption>
              <thead>
                <tr className="border-b border-border bg-card text-left text-caption text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Platform</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {INTEGRATIONS.rows.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium ${STATUS_TONE[row.status]}`}>
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                        {INTEGRATIONS.statusLabels[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 max-w-3xl text-small text-muted-foreground">
            The CMP rows describe what the scanner can operate today. The full
            methodology — including the honest boundaries of heuristic
            detection — is documented on the{" "}
            <Link href="/methodology" className="text-primary hover:underline">
              methodology
            </Link>{" "}
            and{" "}
            <Link href="/resources" className="text-primary hover:underline">
              CMP compatibility
            </Link>{" "}
            pages.
          </p>
        </Container>
      </Section>

      <CtaSection
        title="Test the scanner against your stack"
        body="Run a free scan on any website you manage and see which journeys it can operate."
        primary={INTEGRATIONS.cta}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </>
  );
}