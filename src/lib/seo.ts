import type { Metadata } from "next";
import { en } from "@pdm/shared/copy";

/**
 * MARKETING SEO HELPERS — dev-doc/features/20-marketing-site.md.
 *
 * Every public page needs title, description, canonical, Open Graph and
 * Twitter metadata. Centralising the construction here means a page cannot
 * forget the canonical URL, and `metadataBase` cannot disagree between pages.
 *
 * `NEXT_PUBLIC_APP_URL` is the same origin the email links and portal magic
 * links are built from, so sitemap URLs and share targets cannot point at a
 * domain the app does not answer on.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const SITE_NAME = en.app.name;

/** Absolute URL for the current page, used by canonical and OG. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

interface PageMetaInput {
  /** Page title — rendered under the root layout's `%s · name` template. */
  title: string;
  description: string;
  /** Route path beginning with `/`, e.g. `/features`. */
  path: string;
}

/**
 * Metadata for one statically prerendered marketing page. Type stays
 * `"website"` everywhere except blog articles, which build their own.
 */
export function pageMetadata({ title, description, path }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Organization + SoftwareApplication — emitted once from the marketing root layout. */
export function siteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: en.app.tagline,
        url: SITE_URL,
      },
    ],
  };
}

/** FAQPage — only for FAQs whose question and answer are both visible on the page. */
export function faqJsonLd(items: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** BreadcrumbList for nested pages (solutions, blog articles). */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
