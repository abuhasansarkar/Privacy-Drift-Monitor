/**
 * HELP ARTICLES — PLAN.md §3.11 (`/app/help`), Phase 6.
 *
 * ⚠️ STRUCTURED TYPESCRIPT, like `content/legal` and `content/blog`, and for
 * the same three reasons: no MDX dependency, search that filters data rather
 * than parsing HTML, and — the one that matters — `scripts/check-terminology.ts`
 * walks `content/`, so help copy goes through the §1.12 gate. Help articles are
 * where somebody is most likely to write "this means you are in breach",
 * because they are explaining a finding to a worried person.
 *
 * ⚠️ EVERY ARTICLE HERE IS A CASE WHERE THE PRODUCT LOOKS BROKEN AND IS NOT.
 * That is the whole selection criterion. A help centre that documents the happy
 * path is a manual nobody opens; one that explains partial scans, cached AI
 * output and drift on a site you did not change is the one support links to.
 */

export interface HelpArticle {
  slug: string;
  title: string;
  /** Matched against the search box, alongside the title and body. */
  keywords: readonly string[];
  body: readonly string[];
}

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "partial-scans",
    title: "Why does a scan say “partial”?",
    keywords: ["partial", "incomplete", "undetermined", "reject", "failed"],
    body: [
      "A scan is partial when at least one of the four consent journeys could not be completed. The most common cause is a banner with no reject control we could find, or one that did not respond to being pressed.",
      "A partial scan is deliberately never reported as clean. If we could not test what happens after Reject All, we do not know what happens after Reject All — and saying \"no issues found\" in that situation would be the most dangerous thing the product could do.",
      "Everything the journeys that DID run recorded is kept and is fully usable. The scan detail page names which phase could not complete and why.",
    ],
  },
  {
    slug: "tracker-still-detected",
    title: "I removed a tracker and it is still being detected",
    keywords: ["removed", "still", "cache", "detected", "tracker", "stale"],
    body: [
      "Findings are produced from the most recent scan, not live. If the site changed after the last scan ran, the finding reflects the last recording — run a scan by hand and it will be re-evaluated.",
      "If it persists after a fresh scan, the request is still happening. The two usual causes are a tag manager container that was published without the change, and a CDN or page cache still serving the old markup.",
      "The evidence on the finding includes the timestamp and the consent state, which is usually enough to tell those two apart.",
    ],
  },
  {
    slug: "drift-on-a-site-i-did-not-change",
    title: "Drift was detected on a site nobody touched",
    keywords: ["drift", "changed", "nobody", "unexpected", "alert"],
    body: [
      "This is the normal case, not an anomaly, and it is the reason the product exists. Most drift comes from something outside the site's own code: a consent platform shipping an update, a plugin auto-updating, a marketing tag added from a dashboard by someone who does not touch the codebase, or a third party changing which endpoints it calls.",
      "The drift timeline shows exactly what changed between the two scans and when. If a change is expected and you do not want to hear about it again, it can be suppressed for that site.",
    ],
  },
  {
    slug: "score-changed-without-new-issues",
    title: "The health score moved but no new issues appeared",
    keywords: ["score", "health", "changed", "dropped", "confidence"],
    body: [
      "A score is capped when a scan is partial, so a site that scanned cleanly last week and partially this week will drop even with no new findings. The breakdown on the scan explains every deduction, and the incomplete-scan cap appears there as its own line.",
      "The breakdown always sums to the score. If it does not, that is a bug and we would like to hear about it.",
    ],
  },
  {
    slug: "ai-explanations",
    title: "How AI explanations work, and what they cannot do",
    keywords: ["ai", "explanation", "credits", "cache", "wrong"],
    body: [
      "AI never decides what was detected. Every finding comes from browser instrumentation and a fixed set of rules, and every finding renders whether AI is switched on or off.",
      "What AI does is explain evidence that was already recorded, and every explanation carries references to the specific evidence rows it is describing. An output whose references do not resolve is rejected before anyone sees it.",
      "Repeat requests for the same finding are served from cache and cost nothing. If an explanation reads wrongly, the thumbs-down on it is genuinely read — it is the input we use to revise the prompt.",
    ],
  },
  {
    slug: "what-counts-as-a-scan",
    title: "What counts as a scan against my plan?",
    keywords: ["scan", "count", "limit", "quota", "usage", "billing"],
    body: [
      "One scan is one run of one website through the consent journeys your plan allows, across as many pages as your plan allows. A re-scan you trigger by hand counts the same as a scheduled one.",
      "A scan that could not complete at all is not counted. A partial scan is counted, because the phases that ran did real work.",
      "Usage resets on your billing period, not on the first of the month, so a mid-period upgrade takes effect immediately.",
    ],
  },
  {
    slug: "client-portal",
    title: "What can my client see in the portal?",
    keywords: ["portal", "client", "share", "access", "safe"],
    body: [
      "The portal shows the health score, the monitoring status, findings in plain language, recent changes and any reports you have generated. It is agency-branded from Growth up: your logo, your colours, your company name.",
      "It never shows internal notes, issue assignments, rule identifiers, raw network requests, cookie values, evidence exports, your billing, or anything belonging to another client.",
    ],
  },
  {
    slug: "scanning-permission",
    title: "Which websites am I allowed to scan?",
    keywords: ["permission", "allowed", "legal", "consent", "terms"],
    body: [
      "Only websites you own or have permission to monitor. This is in the terms because it matters: pointing an automated browser at a site you have no relationship with is not something we will support.",
      "For client sites, the care plan or maintenance agreement you already have is normally sufficient. If in doubt, ask them.",
    ],
  },
];

/** §3.11: "searchable help articles". Substring, case-insensitive, no index. */
export function searchHelp(query: string): readonly HelpArticle[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) =>
    [article.title, ...article.keywords, ...article.body]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
