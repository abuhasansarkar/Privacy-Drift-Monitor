import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { DocPage } from "@/components/marketing/doc-page";
import { METHODOLOGY } from "@content/marketing/pages";

/**
 * `/methodology` — the trust asset for technical evaluators.
 *
 * ⚠️ STATICALLY PRERENDERED. This page's entire job is to be read carefully
 * and ranked; nothing on it changes per request.
 */
export const metadata: Metadata = pageMetadata({
  title: METHODOLOGY.title,
  description: METHODOLOGY.subtitle,
  path: "/methodology",
});

export default function MethodologyPage() {
  return (
    <DocPage
      content={{
        ...METHODOLOGY,
        sections: METHODOLOGY.sections,
        cta: {
          ...METHODOLOGY.cta,
          title: "See a scan run on a site you know",
          body: "The fastest way to evaluate the methodology is to watch it produce evidence on your own website.",
        },
      }}
    />
  );
}