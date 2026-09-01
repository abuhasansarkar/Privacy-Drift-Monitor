import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { BLOG_POSTS } from "@content/blog";
import { formatDate } from "@/lib/format";

/**
 * `/blog` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ STATICALLY PRERENDERED, like every marketing page. The posts are a
 * constant, so there is no database read and no request-time work on a page
 * whose entire job is to be indexed.
 */
export const metadata: Metadata = {
  title: t("marketingPages.blogTitle"),
  description: t("marketingPages.blogSubtitle"),
};

export default function BlogIndexPage() {
  // Newest first. Sorted here rather than in the data, so adding a post is one
  // edit and cannot put itself in the wrong place.
  const posts = [...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketingPages.blogTitle")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("marketingPages.blogSubtitle")}
      </p>

      <div className="mt-12 flex flex-col divide-y divide-border border-y border-border">
        {posts.map((post) => (
          <article key={post.slug} className="py-6">
            <p className="text-caption text-muted-foreground">
              <time dateTime={post.publishedAt}>
                {formatDate(new Date(post.publishedAt), "UTC")}
              </time>
            </p>
            <h2 className="mt-1 text-h2 tracking-tight">
              <Link href={`/blog/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="mt-2 text-body text-muted-foreground">{post.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
