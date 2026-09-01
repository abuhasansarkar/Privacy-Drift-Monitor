import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { BLOG_POSTS, CMP_SUPPORT } from "@content/blog";

/**
 * `/resources` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ THE CMP TABLE IS THE REASON THIS PAGE EXISTS. §3.2: "genuinely useful SEO
 * and **doubles as honest limitation disclosure**". A buyer's first question is
 * "does it work with the banner my client uses", and the honest answer includes
 * the two rows at the bottom — bespoke banners fall back to generic strategies,
 * and sometimes that comes back undetermined rather than as a pass.
 *
 * Publishing the limitation is not modesty. A tool that quietly reported
 * "rejection works" for a banner it could not operate would be worse than
 * useless, and saying so up front is what makes the rest of the table
 * believable.
 */
export const metadata: Metadata = {
  title: t("marketingPages.resourcesTitle"),
  description: t("marketingPages.resourcesSubtitle"),
};

export default function ResourcesPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketingPages.resourcesTitle")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("marketingPages.resourcesSubtitle")}
      </p>

      <h2 className="mt-14 text-h2 tracking-tight">{t("marketingPages.cmpTableTitle")}</h2>
      <p className="mt-3 text-body text-muted-foreground">
        {t("marketingPages.cmpTableSubtitle")}
      </p>

      {/* Scrolls inside its own container — the page body never scrolls
          sideways (§11.5). */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[36rem] text-small">
          <thead>
            <tr className="border-b border-border bg-card text-left text-caption text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("marketingPages.cmpPlatform")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("marketingPages.cmpDetection")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("marketingPages.cmpNotes")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CMP_SUPPORT.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5">{row.detection}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-14 text-h2 tracking-tight">{t("marketingPages.blogTitle")}</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="text-body hover:underline">
              {post.title}
            </Link>
            <p className="text-small text-muted-foreground">{post.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
