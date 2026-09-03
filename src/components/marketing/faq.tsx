import { faqJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/marketing/json-ld";
import type { FaqItem } from "@content/marketing/faqs";
import { Eyebrow } from "./section";

/**
 * FAQ — NATIVE `<details>`, NOT AN ACCORDION COMPONENT (same decision the
 * existing pricing page made): the answers are the part a crawler indexes and
 * the part a no-JS visitor needs, so they must be in the DOM open by default.
 *
 * FAQPage JSON-LD is emitted only when `withSchema` is set, and only for the
 * exact items rendered here — structured data that matches visible content.
 */
export function Faq({
  eyebrow,
  heading,
  items,
  withSchema = false,
}: {
  eyebrow?: string;
  heading: string;
  items: readonly FaqItem[];
  withSchema?: boolean;
}) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-3xl px-4">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="mt-2 text-h2 tracking-tight">{heading}</h2>

        {withSchema ? <JsonLd data={faqJsonLd(items)} /> : null}

        <div className="mt-8 flex flex-col divide-y divide-border border-y border-border">
          {items.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                <span className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-muted-foreground transition group-open:rotate-90"
                  >
                    ›
                  </span>
                  {item.question}
                </span>
              </summary>
              <p className="mt-2 pl-5 text-body text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
