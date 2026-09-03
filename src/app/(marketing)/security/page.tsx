import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { DocPage } from "@/components/marketing/doc-page";
import { SECURITY } from "@content/marketing/pages";

/**
 * `/security` — implemented controls only.
 *
 * ⚠️ STATICALLY PRERENDERED, and the copy is constrained to controls that
 * actually exist in this codebase (tenant-scoped data access, the SSRF guard,
 * isolated browser workers, encrypted storage, audit logs, retention sweeps).
 */
export const metadata: Metadata = pageMetadata({
  title: SECURITY.title,
  description: SECURITY.subtitle,
  path: "/security",
});

export default function SecurityPage() {
  return (
    <DocPage
      content={{
        ...SECURITY,
        sections: SECURITY.sections,
        cta: {
          ...SECURITY.cta,
          title: "Talk to us about a security review",
          body: "Enterprise buyers are welcome to run through any control on this page with our team in detail.",
        },
      }}
    />
  );
}