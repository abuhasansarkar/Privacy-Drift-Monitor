import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { BLOG_POSTS, findPost } from "@content/blog";
import { formatDate } from "@/lib/format";

/**
 * `/blog/[slug]` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ `generateStaticParams` MAKES EVERY POST A STATIC FILE. §3.2 asks for it,
 * and the reason is that a blog is the one surface where a cold-start render is
 * paid for by a search crawler rather than by a customer.
 *
 * ⚠️ JSON-LD `Article`, from a local constant. Nothing in the payload comes
 * from user input, which is why the raw injection below is safe.
 */
export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: t("marketingPages.blogTitle") };

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  // `params` is a Promise in Next 16 (AGENTS.md).
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { "@type": "Organization", name: post.author },
  };

  /*
   * §3.2 asks for reading time. Derived from the text rather than authored,
   * because a hand-written estimate is wrong the moment anyone edits a
   * paragraph — and nobody remembers to update it.
   */
  const words = post.sections
    .flatMap((section) => [section.heading, ...section.body, ...(section.list ?? [])])
    .join(" ")
    .split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto w-full max-w-2xl px-4 py-20">
        <p className="text-caption text-muted-foreground">
          <time dateTime={post.publishedAt}>
            {formatDate(new Date(post.publishedAt), "UTC")}
          </time>{" "}
          · {minutes} min read
        </p>
        <h1 className="mt-2 text-display tracking-tight text-balance">{post.title}</h1>
        <p className="mt-4 text-body-lg text-muted-foreground">{post.lead}</p>

        {/* Table of contents, generated from the data — see the note in
            `content/legal/index.ts` about why the content is structured. */}
        <nav aria-label="Contents" className="mt-10 rounded-lg border border-border p-4">
          <ol className="flex flex-col gap-1 text-small">
            {post.sections.map((section) => (
              <li key={section.heading}>
                <a
                  href={`#${slugify(section.heading)}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 flex flex-col gap-8">
          {post.sections.map((section) => (
            <section key={section.heading} id={slugify(section.heading)}>
              <h2 className="text-h2 tracking-tight">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-body text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.list ? (
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body text-muted-foreground">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <Link href="/blog" className="text-small text-primary hover:underline">
            ← {t("marketingPages.blogTitle")}
          </Link>
        </div>
      </article>
    </>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
