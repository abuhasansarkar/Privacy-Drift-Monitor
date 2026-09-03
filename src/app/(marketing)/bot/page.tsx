import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { DocPage } from "@/components/marketing/doc-page";
import { BOT } from "@content/marketing/pages";

/**
 * `/bot` — scanner transparency page (PLAN.md §5.1, feature 20 acceptance).
 *
 * Identifies the scanner, its user agent, its visit pattern, and how to block
 * or exclude a website. Being findable under a reverse-engineered UA is what
 * makes monitoring ethically defensible; this page exists so the scanner
 * cannot be mistaken for something that hides.
 */
export const metadata: Metadata = pageMetadata({
  title: BOT.title,
  description: BOT.subtitle,
  path: "/bot",
});

export default function BotPage() {
  return <DocPage content={{ ...BOT, sections: BOT.sections }} />;
}