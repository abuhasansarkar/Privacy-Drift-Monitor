import { siteJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

/**
 * PUBLIC LAYOUT — §3.1, §3.2. Phase 0 task 0.11.
 *
 * One of the four route-group layouts §3.1 requires, each with its own auth
 * posture, kept physically separate "so an unauthenticated page can never
 * accidentally inherit an authenticated shell". This one is the unauthenticated
 * surface: it resolves no tenant context and renders no app chrome.
 *
 * Pages under it stay STATICALLY PRERENDERED. Nothing here calls `cookies()`,
 * `headers()` or a server-side Clerk helper — the only auth-aware piece is
 * `MarketingAuthLinks` inside the header island, a client component. Adding a
 * server-side auth check to this file would silently make every marketing page
 * dynamic.
 *
 * The header and footer are the shared chrome every public page gets; the
 * boundary statement (§1.11) lives in the footer, above the link columns.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Organization + SoftwareApplication, once, for the whole public surface. */}
      <JsonLd data={siteJsonLd()} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <MarketingHeader />

      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>

      <MarketingFooter />
    </>
  );
}

