/**
 * BLOG AND GUIDES — PLAN.md §3.2 (`/blog`, `/guides`, `/resources`).
 *
 * ⚠️ STRUCTURED TYPESCRIPT, NOT MDX — the same deviation `content/legal` makes
 * and for the same reasons: no `@next/mdx` dependency, no `next.config` change,
 * a table of contents generated from data rather than parsed out of rendered
 * HTML, and — the one that actually matters here —
 * `scripts/check-terminology.ts` walks `content/`, so every published word goes
 * through the §1.12 gate. Marketing copy is the single most likely place for a
 * compliance claim to slip in, and MDX files that the checker did not scan
 * would be the easiest possible way for one to ship.
 *
 * ⚠️ THESE ARE REAL ARTICLES, NOT LOREM. A blog index with three placeholder
 * posts is worse than no blog: it is indexed, it is linked from the footer, and
 * it tells a visitor evaluating us that nobody is home.
 */

export interface BlogSection {
  heading: string;
  body: readonly string[];
  list?: readonly string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO. Rendered through `Intl` with an explicit locale (§11.11). */
  publishedAt: string;
  updatedAt?: string;
  author: string;
  tags: readonly string[];
  /** Lead paragraph, also used as the meta description fallback. */
  lead: string;
  sections: readonly BlogSection[];
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "what-privacy-drift-is",
    title: "Privacy drift: why a site that was fine last month is not fine today",
    description:
      "Consent setups decay. A marketing tag added by someone with dashboard access, a CMP that silently updates, a plugin that ships a new endpoint — none of it announces itself.",
    publishedAt: "2026-07-14",
    author: "Privacy Drift Monitor",
    tags: ["drift", "monitoring"],
    lead: "Nobody sets out to break a consent configuration. It breaks anyway, and it breaks quietly.",
    sections: [
      {
        heading: "The audit is a photograph",
        body: [
          "A privacy audit tells you what a website did on one afternoon. It is genuinely useful and it goes out of date immediately, because a website is not a document — it is a system with several people, a tag manager, a CMS and a dozen plugins all able to change what loads.",
          "The gap between the audit and today is where the risk accumulates, and it is invisible by construction: the site looks the same.",
        ],
      },
      {
        heading: "Four things that change without anyone deciding to",
        body: [
          "In practice the same handful of causes come up again and again.",
        ],
        list: [
          "Somebody with marketing-dashboard access adds a pixel. It fires immediately, before any consent, because the tag manager was never wired through the consent platform.",
          "The consent platform ships an update. The banner looks identical and the category mapping has moved.",
          "A plugin update adds a new third-party endpoint that the old configuration does not cover.",
          "A campaign landing page is built outside the main template and never gets the consent script at all.",
        ],
      },
      {
        heading: "What continuous monitoring actually gives you",
        body: [
          "Loading a site in a real browser on a schedule, under each consent state, and comparing the recording with the last one turns an invisible change into a dated event with evidence attached.",
          "That is a different artefact from an audit. It is not a verdict, and it is not legal advice — it is a record of what a browser observed, and the date it started happening.",
        ],
      },
    ],
  },
  {
    slug: "what-a-consent-journey-tests",
    title: "What we actually do to a website during a scan",
    description:
      "Four consent journeys, one browser, and a recording of every request, cookie and storage write tagged with the consent state it happened under.",
    publishedAt: "2026-08-02",
    author: "Privacy Drift Monitor",
    tags: ["scanner", "how-it-works"],
    lead: "A scan is not a crawl and it is not a header check. It is a browser being asked to behave like four different visitors.",
    sections: [
      {
        heading: "The four journeys",
        body: [
          "Each one is a fresh browser context with no shared state, because a cookie left over from the previous journey would make the next one lie.",
        ],
        list: [
          "No consent — load the page and touch nothing. Anything that fires here fired without being asked.",
          "Reject All — find the reject control, press it, and keep watching. This is the journey that most often disagrees with what a site's own documentation claims.",
          "Accept All — the baseline for what the site loads at full consent, which is what makes the first two meaningful by comparison.",
          "Withdraw — go back and change the answer. Withdrawal is the least-tested path on almost every site we look at.",
        ],
      },
      {
        heading: "Why a failed journey is reported, not hidden",
        body: [
          "If we cannot find a reject control, the scan is marked partial and says so. It does not report a clean result.",
          "This matters more than it sounds. A monitoring tool that quietly treats 'we could not test rejection' as 'rejection works' produces exactly the false comfort it was bought to remove.",
        ],
      },
      {
        heading: "Everything is recorded before anything is interpreted",
        body: [
          "The browser layer records; the rules interpret. Nothing downstream can add a fact, which is what makes a finding replayable — you can go back to the recording and see the request, its timestamp, and the consent state it happened under.",
        ],
      },
    ],
  },
  {
    slug: "reselling-privacy-monitoring",
    title: "Adding privacy monitoring to a care plan",
    description:
      "The arithmetic agencies use, and the two things that make the conversation with the client easy.",
    publishedAt: "2026-08-20",
    author: "Privacy Drift Monitor",
    tags: ["agencies", "pricing"],
    lead: "Most agencies we talk to already have a monthly care plan. This slots into it rather than becoming a new sale.",
    sections: [
      {
        heading: "The arithmetic",
        body: [
          "Agencies typically add $10–25 per site per month for monitoring. On forty client sites that is $400–1,000 of monthly revenue against a plan cost of $149.",
          "That margin is the argument, and it is why we do not price per site at our end — per-site pricing at the supplier level compresses the reseller's margin and makes the arithmetic visible to the client.",
        ],
      },
      {
        heading: "Two things that make the client conversation easy",
        body: [
          "First, the report is yours. Your logo, your colours, your company name; nothing client-facing mentions us.",
          "Second, the finding is evidence, not opinion. 'A request to this analytics endpoint was observed 1.8 seconds after the page loaded, before any consent was given' is a sentence a developer can act on and a client can understand, and neither of them has to take anyone's word for it.",
        ],
      },
      {
        heading: "What it does not do",
        body: [
          "It does not tell your client whether they are meeting their legal obligations, and you should not tell them it does. It reports what a browser observed and flags what looks worth reviewing. What that means for a particular business is a question for that business and its advisor.",
        ],
      },
    ],
  },
];

export function findPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

/**
 * §3.2's CMP compatibility table — "genuinely useful SEO and doubles as
 * **honest limitation disclosure**".
 *
 * ⚠️ THE SECOND HALF OF THAT SENTENCE IS THE POINT, and it is why the table
 * lists what we CANNOT do beside what we can. A support matrix that shows only
 * the five green rows is marketing; one that says "a bespoke banner falls back
 * to a generic strategy and is sometimes undetermined" is the disclosure a
 * buyer needs before they find out on their own site.
 *
 * The five named adapters are the ones in `packages/scanner/src/consent/
 * cmp-adapters.ts`. If that list changes, this one is wrong.
 */
export interface CmpSupportRow {
  name: string;
  detection: "Dedicated adapter" | "Generic strategies";
  notes: string;
}

export const CMP_SUPPORT: readonly CmpSupportRow[] = [
  {
    name: "Cookiebot",
    detection: "Dedicated adapter",
    notes: "Banner, reject and withdraw all handled directly.",
  },
  {
    name: "CookieYes",
    detection: "Dedicated adapter",
    notes: "Banner, reject and withdraw all handled directly.",
  },
  {
    name: "Complianz",
    detection: "Dedicated adapter",
    notes: "Banner, reject and withdraw all handled directly.",
  },
  {
    name: "OneTrust",
    detection: "Dedicated adapter",
    notes: "Banner and reject handled directly; withdrawal varies by configuration.",
  },
  {
    name: "Usercentrics",
    detection: "Dedicated adapter",
    notes: 'Banner and reject handled directly, including the "Deny" wording.',
  },
  {
    name: "Bespoke and in-house banners",
    detection: "Generic strategies",
    notes:
      "Matched by button text and common patterns. Usually works; when it does not, the journey is reported as undetermined rather than as a pass.",
  },
  {
    name: "No consent platform",
    detection: "Generic strategies",
    notes:
      "Nothing to interact with, so only the no-consent journey is meaningful. That is reported plainly rather than scored as a clean result.",
  },
];
