import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS, findLegalDocument, type LegalSection } from "@content/legal";
import { t } from "@pdm/shared/copy";

/**
 * LEGAL DOCUMENT TEMPLATE — §3.2, UI_DESIGN_PROMPTS §4.11.
 *
 * "A narrow 720px centred prose column with a 30px semibold title, a muted
 * 'Last updated' line… On the left, a sticky table-of-contents rail."
 *
 * ⚠️ STATICALLY PRERENDERED. `generateStaticParams` enumerates the four
 * documents and nothing in the tree calls `cookies()` or a server-side Clerk
 * helper — the same rule the rest of `(marketing)` follows. A legal page that
 * became dynamic would be uncacheable for no reason.
 *
 * ⚠️ THE TABLE OF CONTENTS IS DERIVED FROM THE DATA, not scraped from rendered
 * HTML. That is the whole reason the documents are structured rather than a
 * blob of markup: an anchor and its entry cannot drift apart.
 */

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ doc: doc.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  const document = findLegalDocument(doc);
  if (!document) return {};
  return { title: document.title, description: document.description };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "UTC",
});

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const document = findLegalDocument(doc);
  if (!document) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 py-16">
      {/* ── Sticky ToC rail. Hidden below lg: on a phone it would push the
             document itself below the fold, which is the opposite of useful. */}
      <nav
        aria-label={t("legal.contents")}
        className="sticky top-20 hidden h-fit w-52 shrink-0 lg:block"
      >
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {t("legal.contents")}
        </p>
        <ul className="flex flex-col gap-1.5">
          {document.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block text-small leading-snug text-muted-foreground transition hover:text-foreground"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {t("legal.otherDocuments")}
        </p>
        <ul className="flex flex-col gap-1.5">
          {LEGAL_DOCUMENTS.filter((other) => other.slug !== document.slug).map((other) => (
            <li key={other.slug}>
              <Link
                href={`/legal/${other.slug}`}
                className="block text-small leading-snug text-muted-foreground transition hover:text-foreground"
              >
                {other.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 max-w-[720px] flex-1">
        <h1 className="text-h1 tracking-tight text-balance">{document.title}</h1>
        <p className="mt-2 text-small text-muted-foreground">
          {t("legal.lastUpdated")}{" "}
          <time dateTime={document.lastUpdated}>
            {DATE_FORMAT.format(new Date(document.lastUpdated))}
          </time>
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {document.intro.map((paragraph) => (
            <p key={paragraph} className="text-body-lg leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        {document.sections.map((section) => (
          <Section key={section.id} section={section} />
        ))}

        {/* Every legal page carries the route back to the others, for readers
            who arrived from a link in an email or a PDF. */}
        <nav aria-label={t("legal.otherDocuments")} className="mt-14 lg:hidden">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {t("legal.otherDocuments")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_DOCUMENTS.filter((other) => other.slug !== document.slug).map((other) => (
              <li key={other.slug}>
                <Link href={`/legal/${other.slug}`} className="text-small text-primary hover:underline">
                  {other.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </div>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <section className="mt-10 scroll-mt-20" id={section.id}>
      <h2 className="text-h3 tracking-tight">{section.heading}</h2>

      {section.body?.map((paragraph) => (
        <p key={paragraph} className="mt-3 leading-relaxed text-muted-foreground">
          {paragraph}
        </p>
      ))}

      {section.list ? (
        <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 leading-relaxed text-muted-foreground">
          {section.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {section.table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                {section.table.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-border px-3 py-2 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map(([left, right]) => (
                <tr key={left}>
                  <td className="border-b border-border px-3 py-2.5 align-top font-medium">
                    {left}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 align-top text-muted-foreground">
                    {right}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
