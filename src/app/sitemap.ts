import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@content/blog";
import { LEGAL_DOCUMENTS } from "@content/legal";
import { INDUSTRIES } from "@content/marketing/industries";
import { SITE_URL } from "@/lib/seo";

/**
 * SITEMAP — dev-doc/features/20-marketing-site.md.
 *
 * ⚠️ EVERY URL LISTED HERE MUST BE PUBLIC IN `src/proxy.ts`. Submitting a URL
 * that answers 307-to-/login is worse than omitting it: the crawler records a
 * redirect to a sign-in page and de-indexes the target. `marketing-routes.test.ts`
 * asserts the two files agree, because this pairing has already gone wrong once
 * — `/solutions`, `/methodology`, `/security`, `/integrations` and `/changelog`
 * all shipped linked-from-the-homepage and gated.
 *
 * ⚠️ BUILT FROM THE SAME CONSTANTS THE PAGES RENDER FROM (`content/`), never a
 * hand-maintained list. A hand-written sitemap drifts the day someone adds an
 * industry page, and the drift is silent in both directions.
 *
 * Only the marketing surface belongs here. `/app`, `/admin` and `/portal` are
 * authenticated and are excluded by `robots.ts` as well.
 */

/** Pages with no content-derived date. The build date is the honest answer. */
const BUILD_DATE = new Date();

interface StaticEntry {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}

const STATIC_PAGES: readonly StaticEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/free-scanner", changeFrequency: "monthly", priority: 0.9 },
  { path: "/solutions", changeFrequency: "monthly", priority: 0.8 },
  { path: "/methodology", changeFrequency: "monthly", priority: 0.7 },
  { path: "/security", changeFrequency: "monthly", priority: 0.7 },
  { path: "/integrations", changeFrequency: "monthly", priority: 0.6 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.5 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/resources", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", changeFrequency: "yearly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/bot", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_PAGES.map((entry) => ({
    url: `${SITE_URL}${entry.path}`,
    lastModified: BUILD_DATE,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  const industryEntries = INDUSTRIES.map((industry) => ({
    url: `${SITE_URL}/solutions/${industry.slug}`,
    lastModified: BUILD_DATE,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const blogEntries = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    // `updatedAt` when the post has been revised, else its publication date —
    // a crawler treats a moving lastModified with no change as a quality signal
    // against the page.
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  const legalEntries = LEGAL_DOCUMENTS.map((doc) => ({
    url: `${SITE_URL}/legal/${doc.slug}`,
    lastModified: new Date(doc.lastUpdated),
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));

  return [...staticEntries, ...industryEntries, ...blogEntries, ...legalEntries];
}
