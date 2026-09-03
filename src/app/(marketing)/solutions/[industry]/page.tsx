import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/marketing/json-ld";
import { IndustryPage } from "@/components/marketing/industry-page";
import { INDUSTRIES, industryBySlug } from "@content/marketing/industries";

/**
 * /solutions/[industry] — per-industry monitoring pages.
 *
 * Statically generated for every Industry.slug at build time. Unknown slugs
 * 404. Each page gets its own title/description and a BreadcrumbList so the
 * industry pages are independently indexable.
 */
export const dynamic = "error";
export const dynamicParams = false;

export async function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({
    industry: industry.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry: slug } = await params;
  const industry = industryBySlug(slug);
  if (!industry) return {};

  return pageMetadata({
    title: industry.hero.title,
    description: industry.hero.subtitle,
    path: `/solutions/${slug}`,
  });
}

export default async function IndustrySolutionPage({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry: slug } = await params;
  const industry = industryBySlug(slug);

  if (!industry) {
    notFound();
  }

  const breadcrumb = breadcrumbJsonLd([
    { name: "Solutions", path: "/solutions" },
    { name: industry.name, path: `/solutions/${slug}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <IndustryPage industry={industry} />
    </>
  );
}
