import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * ROBOTS — dev-doc/features/20-marketing-site.md, PLAN.md §3.2.
 *
 * ⚠️ THE DISALLOW LIST IS NOT A SECURITY CONTROL, and nothing here should be
 * read as one. `/app`, `/admin` and `/portal` are protected by `auth.protect()`
 * and the portal session scheme; this file only stops a crawler wasting budget
 * on URLs that answer with a redirect, and stops sign-in pages competing with
 * the marketing pages in search results.
 *
 * ⚠️ `/free-scanner/[token]` IS EXCLUDED DELIBERATELY. A result page is
 * addressed by an unguessable token and describes a third party's website. It
 * is not ours to publish, and an indexed result URL would outlive the retention
 * window the scan itself is subject to. The `/free-scanner` entry point is
 * indexable; its results are not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app/",
          "/admin/",
          "/portal/",
          "/api/",
          "/login",
          "/signup",
          "/reports/shared/",
          "/free-scanner/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
