/**
 * DEMO DATA — Phase 0 task 0.3, PLAN.md §12.6 (launch checklist).
 *
 * Seeds one agency with **realistic multi-month history**: clients, websites,
 * a scan every week for twelve weeks, evidence, issues that open and close,
 * drift events, and a health score that actually moves.
 *
 * Run: npm run db:seed:demo
 *
 * ⚠️ A SEPARATE SCRIPT FROM `seed.ts`, AND THAT SEPARATION IS THE SAFETY
 * PROPERTY. `seed.ts` seeds three GLOBAL tables (vendors, plans, flags) that
 * every environment needs, and it runs automatically after `prisma migrate`.
 * This one writes TENANT rows. Folding it in would put fabricated agencies and
 * fabricated findings one `migrate deploy` away from production — and a
 * fabricated finding in a real customer's account is the single worst data
 * defect this product could have.
 *
 * ⚠️ IT REFUSES TO RUN AGAINST A NON-LOCAL DATABASE, for the same reason.
 *
 * ⚠️ EVERY NUMBER HERE IS FABRICATED AND MUST LOOK IT. The agency is
 * "Northlight Digital (Demo)" and the websites are `.test` domains, which are
 * reserved by RFC 2606 and can never resolve. Nobody should be able to mistake
 * a demo row for a real recording — the product's whole claim is that its
 * findings come from an actual browser.
 *
 * ⚠️ IDEMPOTENT. Re-running rebuilds the demo data, so it is safe in a loop
 * while building a dashboard.
 *
 * ## Which agency does it seed?
 *
 *     npm run db:seed:demo                    → a standalone "Northlight Digital (Demo)"
 *     npm run db:seed:demo -- --agency <slug> → attaches the data to an EXISTING agency
 *     npm run db:seed:demo -- --list          → shows the agencies you could target
 *
 * ⚠️ THE STANDALONE MODE IS INVISIBLE TO YOU IN THE APP, AND THAT IS THE WHOLE
 * REASON `--agency` EXISTS. Tenant isolation is enforced at the data-access
 * layer (P4), so demo data in its own agency is correctly unreachable from the
 * agency your Clerk account actually belongs to — every page renders its empty
 * state, and the seed looks broken when it is working exactly as designed.
 * Use `--list` to find your slug, then `--agency <slug>`.
 *
 * ⚠️ IN `--agency` MODE IT NEVER DELETES THE AGENCY. Standalone mode drops the
 * whole demo agency and rebuilds; targeted mode removes ONLY the rows this
 * script created — websites whose host is one of the reserved `.test` domains
 * below, and clients with the demo slugs. Deleting a real agency to make a demo
 * idempotent would be an unrecoverable mistake in someone's working account.
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_SLUG = "northlight-demo";
const WEEKS = 12;

/** RFC 2606 reserved — these can never resolve, so they can never be scanned. */
const SITES = [
  { host: "riverbank-cafe.test", name: "Riverbank Café", client: "Riverbank Hospitality" },
  { host: "meadowlark-clinic.test", name: "Meadowlark Clinic", client: "Meadowlark Health" },
  { host: "orbit-outdoors.test", name: "Orbit Outdoors", client: "Orbit Retail" },
  { host: "quarry-law.test", name: "Quarry & Partners", client: "Quarry Legal" },
  { host: "tidewater-books.test", name: "Tidewater Books", client: "Orbit Retail" },
] as const;

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal =
    url.includes("@localhost") || url.includes("@127.0.0.1") || url.includes("@postgres");
  if (!isLocal) {
    throw new Error(
      "Refusing to seed demo data: DATABASE_URL does not point at localhost.\n" +
        "This script writes fabricated agencies, findings and evidence. It must " +
        "never run against a shared or production database.",
    );
  }
}

/** `weeksAgo(0)` is now; `weeksAgo(12)` is the start of the history. */
function weeksAgo(n: number): Date {
  return new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);
}

/**
 * A deterministic pseudo-random generator.
 *
 * ⚠️ SEEDED, NOT `Math.random()`. Re-running the demo seed must produce the
 * same history: a dashboard screenshot taken yesterday should still match the
 * data today, and a chart that reshuffles on every seed makes "is this a
 * rendering bug or new data?" unanswerable.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 0x100000000;
    return state / 0x100000000;
  };
}


/**
 * The drift story, as a table.
 *
 * ⚠️ WRITTEN OUT RATHER THAN GENERATED, because a demo dataset has to be
 * *legible*: someone opening `/app/drift` should read a plausible fortnight at
 * an agency, not noise. `week` counts backwards from now (1 = last week), so
 * weeks 1–4 fall inside the 30-day feed and the rest give the per-website
 * Changes tab and the trend charts some history behind them.
 *
 * `site` indexes `SITES`. Site 0 (Riverbank) is the degrading one and carries
 * the CRITICAL regression; site 1 (Meadowlark) improves and shows a removal.
 */
const DRIFT_SCHEDULE: ReadonlyArray<{
  site: number;
  week: number;
  changeType:
    | "TRACKER_ADDED"
    | "TRACKER_REMOVED"
    | "COOKIE_ADDED"
    | "CONSENT_REGRESSION"
    | "CMP_CHANGED"
    | "THIRD_PARTY_DOMAIN_ADDED"
    | "SCORE_DROP"
    | "UNKNOWN_VENDOR_ADDED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  summary: string;
  added?: string[];
  removed?: string[];
}> = [
  // ── Inside the 30-day window ──────────────────────────────────────────
  {
    site: 0, week: 1, changeType: "CONSENT_REGRESSION", severity: "CRITICAL",
    summary: "Marketing tags now fire before a consent choice, which they did not last week.",
    added: ["meta-pixel", "google-analytics-4"],
  },
  {
    site: 2, week: 1, changeType: "TRACKER_ADDED", severity: "HIGH",
    summary: "Hotjar was detected for the first time, loading before consent.",
    added: ["hotjar"],
  },
  {
    site: 4, week: 1, changeType: "COOKIE_ADDED", severity: "LOW",
    summary: "A new first-party cookie `_shop_sess` was set during the no-consent phase.",
    added: ["_shop_sess"],
  },
  {
    site: 1, week: 2, changeType: "TRACKER_REMOVED", severity: "INFO",
    summary: "Meta Pixel is no longer present — the fix from two weeks ago holds.",
    removed: ["meta-pixel"],
  },
  {
    site: 3, week: 2, changeType: "THIRD_PARTY_DOMAIN_ADDED", severity: "MEDIUM",
    summary: "A new third-party domain `cdn.embedly.test` began loading on the home page.",
    added: ["cdn.embedly.test"],
  },
  {
    site: 0, week: 3, changeType: "SCORE_DROP", severity: "HIGH",
    summary: "The health score fell 14 points after two trackers were added.",
  },
  {
    site: 2, week: 3, changeType: "UNKNOWN_VENDOR_ADDED", severity: "MEDIUM",
    summary: "An unrecognised third party `px.adroute.test` was seen three times.",
    added: ["px.adroute.test"],
  },
  {
    site: 4, week: 4, changeType: "CMP_CHANGED", severity: "MEDIUM",
    summary: "The consent platform changed from Cookiebot to Complianz.",
  },
  // ── Older history, for the per-website tab and the trend charts ───────
  {
    site: 0, week: 6, changeType: "TRACKER_ADDED", severity: "HIGH",
    summary: "Meta Pixel was detected before consent for the first time.",
    added: ["meta-pixel"],
  },
  {
    site: 1, week: 7, changeType: "CONSENT_REGRESSION", severity: "CRITICAL",
    summary: "Analytics fired after Reject All was clicked.",
    added: ["google-analytics-4"],
  },
  {
    site: 3, week: 9, changeType: "COOKIE_ADDED", severity: "LOW",
    summary: "A 24-month analytics cookie was introduced.",
    added: ["_ga"],
  },
  {
    site: 2, week: 10, changeType: "TRACKER_ADDED", severity: "MEDIUM",
    summary: "LinkedIn Insight began loading on the contact page.",
    added: ["linkedin-insight"],
  },
];

function parseArgs(argv: readonly string[]): { agencySlug: string | null; list: boolean } {
  const list = argv.includes("--list");
  const at = argv.indexOf("--agency");
  const agencySlug = at !== -1 ? (argv[at + 1] ?? null) : null;
  if (at !== -1 && !agencySlug) {
    throw new Error("--agency needs a slug. Run with --list to see them.");
  }
  return { agencySlug, list };
}

async function listAgencies(): Promise<void> {
  const agencies = await prisma.agency.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      slug: true,
      _count: { select: { websites: true } },
    },
  });

  console.log("Agencies in this database:\n");
  for (const a of agencies) {
    const marker = a.slug === DEMO_SLUG ? "  (standalone demo)" : "";
    console.log(
      `  ${a.slug.padEnd(30)} ${String(a._count.websites).padStart(2)} sites  ${a.name}${marker}`,
    );
  }
  console.log("\nSeed into one of them:");
  console.log("  npm run db:seed:demo -- --agency <slug>");
}

/**
 * Removes only what a previous run of THIS script created in a target agency.
 *
 * ⚠️ MATCHED BY THE RESERVED `.test` HOSTS, not by "everything in the agency".
 * A real agency may already have real websites and real findings; this must be
 * able to run beside them without touching them.
 */
async function clearDemoRows(agencyId: string): Promise<void> {
  const hosts = SITES.map((s) => s.host);
  await prisma.website.deleteMany({ where: { agencyId, host: { in: hosts } } });
  await prisma.client.deleteMany({
    where: {
      agencyId,
      slug: { in: [...new Set(SITES.map((s) => slugify(s.client)))] },
    },
  });
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function main() {
  assertLocalDatabase();

  const { agencySlug, list } = parseArgs(process.argv.slice(2));
  if (list) {
    await listAgencies();
    return;
  }

  let agency;
  if (agencySlug) {
    const target = await prisma.agency.findUnique({ where: { slug: agencySlug } });
    if (!target) {
      console.error(`No agency with slug "${agencySlug}".`);
      await listAgencies();
      process.exit(1);
    }
    console.log(`Seeding demo data into "${target.name}" (${target.slug})…`);
    // ⚠️ Never `agency.delete` here — see the header.
    await clearDemoRows(target.id);
    agency = target;
  } else {
    console.log("Seeding demo data…");
    // Standalone: cascade removes every child row, so re-running is clean.
    await prisma.agency.deleteMany({ where: { slug: DEMO_SLUG } });
    agency = await prisma.agency.create({
      data: {
        clerkOrgId: `org_${DEMO_SLUG}`,
        name: "Northlight Digital (Demo)",
        slug: DEMO_SLUG,
        timezone: "Europe/London",
        status: "ACTIVE",
      },
    });
  }

  /*
   * A demo owner, for the STANDALONE agency only.
   *
   * ⚠️ In `--agency` mode the target already has real members, and adding a
   * fabricated OWNER to somebody's real agency would be a privilege grant, not
   * demo data.
   *
   * ⚠️ UPSERT, NOT CREATE. `User` is a GLOBAL model (see `GLOBAL_MODELS` in
   * `tenant.ts`) — it carries no `agencyId`, so deleting the demo agency above
   * cascades away the membership but leaves the user behind. A plain `create`
   * therefore succeeds exactly once and fails with P2002 on every re-run.
   */
  if (!agencySlug) {
    const owner = await prisma.user.upsert({
      where: { clerkUserId: `user_${DEMO_SLUG}_owner` },
      create: {
        clerkUserId: `user_${DEMO_SLUG}_owner`,
        email: "owner@northlight.test",
        firstName: "Demo",
        lastName: "Owner",
      },
      update: {},
    });
    await prisma.agencyMember.upsert({
      where: { agencyId_userId: { agencyId: agency.id, userId: owner.id } },
      create: { agencyId: agency.id, userId: owner.id, role: "OWNER" },
      update: {},
    });
  }

  const vendors = await prisma.trackerVendor.findMany({
    where: { slug: { in: ["google-analytics-4", "meta-pixel", "hotjar", "linkedin-insight"] } },
  });
  if (vendors.length === 0) {
    throw new Error("No tracker vendors found — run `npm run db:seed` first.");
  }

  const clientNames = [...new Set(SITES.map((s) => s.client))];
  const clients = new Map<string, string>();
  for (const name of clientNames) {
    const client = await prisma.client.create({
      data: {
        agencyId: agency.id,
        name,
        slug: slugify(name),
        contactEmail: `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.test`,
        portalEnabled: true,
      },
    });
    clients.set(name, client.id);
  }

  let totalScans = 0;
  let totalIssues = 0;
  let totalDrift = 0;

  for (const [index, site] of SITES.entries()) {
    const random = makeRandom(index + 1);
    const website = await prisma.website.create({
      data: {
        agencyId: agency.id,
        clientId: clients.get(site.client)!,
        url: `https://${site.host}/`,
        originalUrl: `https://${site.host}/`,
        registrableDomain: site.host,
        host: site.host,
        // `label` — the human name on a Website; `name` belongs to Client.
        label: site.name,
        monitoringStatus: "ACTIVE",
        scanFrequency: "WEEKLY",
        monitoredPaths: ["/"],
        nextScanAt: new Date(Date.now() + 86_400_000),
      },
    });

    /*
     * A score that MOVES, and moves for a reason.
     *
     * ⚠️ A flat 82 across twelve weeks would make every trend chart a straight
     * line and prove nothing about whether the chart works. Site 0 degrades
     * (a tracker is added mid-history), site 1 improves (an issue is fixed),
     * the rest drift mildly. That is what makes the dashboard demonstrable.
     */
    const direction = index === 0 ? -1 : index === 1 ? 1 : 0;
    let previousScanId: string | null = null;

    for (let week = WEEKS; week >= 1; week--) {
      const at = weeksAgo(week);
      const progress = (WEEKS - week) / WEEKS;
      const driftAmount = direction * Math.round(progress * 22);
      const jitter = Math.round((random() - 0.5) * 6);
      const score = Math.max(12, Math.min(98, 78 + driftAmount + jitter));

      /*
       * ⚠️ ONE SCAN IN TWELVE IS `PARTIAL`, DELIBERATELY. P5 makes PARTIAL a
       * first-class outcome, and the UI is required to say so rather than
       * render a clean verdict. A demo dataset with no PARTIAL scan means that
       * path is never seen while building the screens that must handle it.
       */
      const isPartial = week === 4 && index === 2;

      const scan = await prisma.scan.create({
        data: {
          agencyId: agency.id,
          websiteId: website.id,
          status: isPartial ? "PARTIAL" : "COMPLETED",
          trigger: "SCHEDULED",
          scannerVersion: "1.0.0",
          startedAt: at,
          finishedAt: new Date(at.getTime() + 145_000),
          durationMs: 145_000,
          healthScore: score,
          scoreConfidence: isPartial ? "PARTIAL" : "FULL",
          detectedCmpName: index % 2 === 0 ? "Cookiebot" : "Complianz",
          pagesScanned: 1,
          requestCount: 40 + Math.round(random() * 60),
          thirdPartyDomainCount: 4 + Math.round(random() * 6),
          cookieCount: 8 + Math.round(random() * 10),
          trackerCount: 2 + Math.round(random() * 3),
        },
      });
      totalScans += 1;

      // Tracker detections — what the Trackers tab reads.
      for (const vendor of vendors.slice(0, 2 + (index % 3))) {
        await prisma.trackerDetection.create({
          data: {
            scanId: scan.id,
            agencyId: agency.id,
            websiteId: website.id,
            vendorId: vendor.id,
            consentPhase: "NO_CONSENT",
            firstSeenAtMs: 800 + Math.round(random() * 2500),
            requestCount: 1 + Math.round(random() * 4),
            matchedVia: "domain",
            confidence: 0.9,
            corroborated: true,
            evidenceSummary: { hosts: vendor.domainPatterns.slice(0, 1) },
          },
        });
      }

      /*
       * DRIFT EVENTS.
       *
       * ⚠️ MOST OF THEM LAND INSIDE THE LAST 30 DAYS, DELIBERATELY. An earlier
       * version of this seed produced ONE event at week 6 — 42 days back — and
       * `/app/drift` (a 30-day feed, `DAYS = 30`) rendered its empty state on a
       * fully-seeded database. The demo looked like a working product with
       * nothing in it, which is worse than no demo data at all: it makes a real
       * query bug and an out-of-window dataset indistinguishable.
       *
       * The schedule below therefore puts events in weeks 1–4 as well as
       * further back, so the 30-day feed, the dashboard widget and the
       * per-website Changes tab all have something to show.
       *
       * ⚠️ `previousScanId` MUST BE A COMPLETED SCAN (§4.10) — comparing against
       * a PARTIAL manufactures phantom removals. `previousScanId` is only
       * advanced on a completed scan below, which is what keeps that true.
       */
      const drifts = DRIFT_SCHEDULE.filter(
        (d) => d.week === week && d.site === index,
      );
      for (const drift of drifts) {
        if (!previousScanId) continue;
        await prisma.privacyDriftEvent.create({
          data: {
            agencyId: agency.id,
            websiteId: website.id,
            currentScanId: scan.id,
            previousScanId,
            changeType: drift.changeType,
            severity: drift.severity,
            summary: drift.summary,
            addedItems: drift.added ?? [],
            removedItems: drift.removed ?? [],
            detectedAt: at,
          },
        });
        totalDrift += 1;
      }

      previousScanId = isPartial ? previousScanId : scan.id;
    }

    /*
     * Issues, with evidence attached to the LATEST scan.
     *
     * ⚠️ EVIDENCE IS WRITTEN, NOT JUST THE ISSUE. `IssueEvidence` is the anchor
     * every AI citation resolves to (P2), so a demo issue with no evidence
     * makes the AI sections permanently unavailable — which looks like a broken
     * feature rather than missing demo data.
     */
    const latestScan = await prisma.scan.findFirst({
      where: { websiteId: website.id, status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
    });
    if (!latestScan) continue;

    const findings = [
      {
        ruleId: "PDM-R001",
        severity: "CRITICAL" as const,
        category: "PRE_CONSENT_TRACKING" as const,
        status: index === 1 ? ("RESOLVED" as const) : ("NEW" as const),
        title: "Marketing tracker detected before consent",
        message: "A marketing tracker was detected before consent was given.",
        technicalReason:
          "A request to a marketing endpoint was observed 1.8 s after navigation, " +
          "under consent state NO_CONSENT.",
        recommendedAction:
          "Move the tag behind a consent-gated trigger, then re-scan to verify.",
      },
      {
        ruleId: "PDM-R004",
        severity: "MEDIUM" as const,
        category: "COOKIE_BEHAVIOR" as const,
        status: "ACKNOWLEDGED" as const,
        title: "Analytics cookie set with a long lifetime",
        message: "A cookie with a 24-month lifetime was detected.",
        technicalReason:
          "The cookie was written during the NO_CONSENT phase with a 730-day expiry.",
        recommendedAction: "Review whether the lifetime is proportionate to its purpose.",
      },
    ];

    for (const finding of findings) {
      const firstDetectedAt = weeksAgo(WEEKS - 2);
      const issue = await prisma.issue.create({
        data: {
          agencyId: agency.id,
          websiteId: website.id,
          firstScanId: latestScan.id,
          lastScanId: latestScan.id,
          ruleId: finding.ruleId,
          ruleVersion: 1,
          fingerprint: `${finding.ruleId}:${website.id}:demo`,
          category: finding.category,
          severity: finding.severity,
          status: finding.status,
          confidence: 0.95,
          title: finding.title,
          message: finding.message,
          technicalReason: finding.technicalReason,
          recommendedAction: finding.recommendedAction,
          firstDetectedAt,
          lastSeenAt: latestScan.startedAt ?? new Date(),
          occurrenceCount: 9,
          ...(finding.status === "RESOLVED"
            ? { resolvedAt: weeksAgo(1), resolution: "FIXED" as const }
            : {}),
        },
      });
      totalIssues += 1;

      await prisma.issueEvidence.createMany({
        data: [
          {
            issueId: issue.id,
            scanId: latestScan.id,
            agencyId: agency.id,
            kind: "NETWORK_REQUEST",
            pageUrl: `https://${site.host}/`,
            consentPhase: "NO_CONSENT",
            observedAtMs: 1842,
            detectionRuleId: finding.ruleId,
            detectionRuleVersion: 1,
            confidence: 0.95,
            payload: {
              method: "GET",
              url: "https://connect.facebook.net/en_US/fbevents.js",
              status: 200,
            } as Prisma.InputJsonValue,
          },
          {
            issueId: issue.id,
            scanId: latestScan.id,
            agencyId: agency.id,
            kind: "COOKIE",
            pageUrl: `https://${site.host}/`,
            consentPhase: "NO_CONSENT",
            observedAtMs: 0,
            detectionRuleId: finding.ruleId,
            detectionRuleVersion: 1,
            confidence: 0.9,
            payload: {
              name: "_fbp",
              domain: `.${site.host}`,
              maxAgeDays: 90,
              httpOnly: false,
            } as Prisma.InputJsonValue,
          },
        ],
      });
    }

    const openCount = findings.filter((f) => f.status !== "RESOLVED").length;
    await prisma.website.update({
      where: { id: website.id },
      data: {
        healthScore: latestScan.healthScore,
        scoreConfidence: latestScan.scoreConfidence,
        lastScanId: latestScan.id,
        lastScanAt: latestScan.startedAt,
        lastSuccessfulScanAt: latestScan.startedAt,
        openIssueCount: openCount,
        criticalIssueCount: findings.filter(
          (f) => f.severity === "CRITICAL" && f.status !== "RESOLVED",
        ).length,
        trackerCount: latestScan.trackerCount,
      },
    });
  }

  console.log(`  ✓ agency        ${agency.name} — slug "${agency.slug}"`);
  console.log(`  ✓ clients       ${clients.size}`);
  console.log(`  ✓ websites      ${SITES.length}`);
  console.log(`  ✓ scans         ${totalScans} (${WEEKS} weeks of history, 1 PARTIAL)`);
  console.log(`  ✓ issues        ${totalIssues} (with IssueEvidence attached)`);
  console.log(`  ✓ drift events  ${totalDrift}`);
  console.log("");
  console.log("  ⚠️  Every row is fabricated. Sites use RFC 2606 `.test` domains,");
  console.log("      which cannot resolve and therefore cannot be scanned.");
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
