import "server-only";
import { PLAN_CATALOGUE, isUnlimited } from "@pdm/billing";
import { adminDb } from "./context";

/**
 * ADMIN READS — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ EVERY FUNCTION HERE IS CROSS-TENANT, WHICH IS THE POINT AND THE DANGER.
 * The whole file goes through `adminDb()` — one named accessor, so a review can
 * grep for it — and every caller that opens ONE agency's data also calls
 * `auditAdminRead` (§3.12: "including reads of tenant data"). Aggregates across
 * every tenant are not audited per-row; opening a specific agency, website or
 * scan is.
 *
 * ⚠️ THESE ARE COUNTS AND AGGREGATES, NOT EXPORTS. An admin page that dumps
 * evidence rows would make the panel a second, unaudited copy of every
 * customer's data. Where an operator genuinely needs the detail — a failing
 * scan — they open that one scan, and that read is recorded.
 */

const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const startOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export interface PlatformOverview {
  agenciesByPlan: Array<{ plan: string; count: number }>;
  agenciesTotal: number;
  activeWebsites: number;
  scansToday: { succeeded: number; partial: number; failed: number; total: number };
  failureRate: number;
  criticalIssuesToday: number;
  aiSpendTodayMicroCents: number;
  aiSpendMtdMicroCents: number;
  /** Monthly recurring revenue in USD minor units. */
  mrrCents: number;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const db = adminDb();
  const today = startOfToday();
  const month = startOfMonth();

  const [
    agenciesTotal,
    activeWebsites,
    scanCounts,
    criticalIssuesToday,
    aiToday,
    aiMtd,
    subscriptions,
  ] = await Promise.all([
    db.agency.count(),
    db.website.count({ where: { archivedAt: null, monitoringStatus: "ACTIVE" } }),
    db.scan.groupBy({
      by: ["status"],
      where: { createdAt: { gte: today } },
      _count: { _all: true },
    }),
    db.issue.count({ where: { severity: "CRITICAL", firstDetectedAt: { gte: today } } }),
    db.aIRequest.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { costMicroCents: true },
    }),
    db.aIRequest.aggregate({
      where: { createdAt: { gte: month } },
      _sum: { costMicroCents: true },
    }),
    /*
     * ⚠️ MRR IS COMPUTED FROM **OUR** SUBSCRIPTION ROWS, NOT ASKED OF STRIPE.
     * Stripe is authoritative for whether a subscription is active (§9.1), and
     * our table is a projection of exactly that, kept current by the webhook and
     * the daily reconciliation. Calling Stripe on a dashboard render would put a
     * third-party round trip — and a Stripe outage — in front of a page whose
     * job is to tell us whether the platform is healthy.
     */
    db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      include: { plan: true },
    }),
  ]);

  const byStatus = new Map(scanCounts.map((row) => [row.status, row._count._all]));
  const succeeded = byStatus.get("COMPLETED") ?? 0;
  const partial = byStatus.get("PARTIAL") ?? 0;
  const failed = byStatus.get("FAILED") ?? 0;
  const total = succeeded + partial + failed;

  const planCounts = new Map<string, number>();
  for (const subscription of subscriptions) {
    planCounts.set(
      subscription.plan.name,
      (planCounts.get(subscription.plan.name) ?? 0) + 1,
    );
  }

  return {
    agenciesTotal,
    agenciesByPlan: [...planCounts.entries()].map(([plan, count]) => ({ plan, count })),
    activeWebsites,
    scansToday: { succeeded, partial, failed, total },
    /*
     * ⚠️ FAILED / TOTAL, AND **PARTIAL IS NOT A FAILURE**. P5 makes PARTIAL a
     * first-class outcome: the phases that ran produced real evidence. Counting
     * it as failure would make the number that decides whether we page someone
     * jump every time a site ships a banner with no reject button — which is a
     * finding, not an incident.
     */
    failureRate: total === 0 ? 0 : failed / total,
    criticalIssuesToday,
    aiSpendTodayMicroCents: aiToday._sum.costMicroCents ?? 0,
    aiSpendMtdMicroCents: aiMtd._sum.costMicroCents ?? 0,
    mrrCents: subscriptions.reduce((total, subscription) => {
      // An annual plan contributes a twelfth of its annual price to MRR.
      const price =
        subscription.interval === "ANNUAL"
          ? Math.round(subscription.plan.priceAnnualCents / 12)
          : subscription.plan.priceMonthlyCents;
      // A trial contributes nothing — it is not recurring revenue until it pays.
      return subscription.status === "TRIALING" ? total : total + price;
    }, 0),
  };
}

export async function listAgencies(query: { search?: string; limit?: number }) {
  const db = adminDb();
  return db.agency.findMany({
    where: query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      subscription: { select: { status: true, plan: { select: { name: true } } } },
      _count: { select: { websites: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
    take: query.limit ?? 50,
  });
}

export async function getAgencyDetail(agencyId: string) {
  const db = adminDb();
  const [agency, usage, aiSpend] = await Promise.all([
    db.agency.findUnique({
      where: { id: agencyId },
      include: {
        subscription: { include: { plan: true } },
        members: {
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        },
        _count: { select: { websites: true, clients: true, scans: true } },
      },
    }),
    db.usageRecord.findMany({ where: { agencyId }, orderBy: { periodStart: "desc" }, take: 12 }),
    db.aIRequest.aggregate({
      where: { agencyId },
      _sum: { costMicroCents: true, creditsCharged: true },
    }),
  ]);
  return { agency, usage, aiSpend };
}

/** §3.12: "find problem sites (consecutive failures, chronic timeouts…)". */
export async function listProblemWebsites(limit = 50) {
  const db = adminDb();
  return db.website.findMany({
    where: { archivedAt: null, consecutiveFailures: { gt: 0 } },
    select: {
      id: true,
      url: true,
      label: true,
      monitoringStatus: true,
      consecutiveFailures: true,
      lastScanAt: true,
      agency: { select: { id: true, name: true } },
    },
    orderBy: [{ consecutiveFailures: "desc" }, { lastScanAt: "desc" }],
    take: limit,
  });
}

export async function listScans(query: { status?: string; limit?: number }) {
  const db = adminDb();
  return db.scan.findMany({
    where: query.status ? { status: query.status as never } : undefined,
    select: {
      id: true,
      status: true,
      trigger: true,
      durationMs: true,
      workerId: true,
      errorCode: true,
      createdAt: true,
      website: { select: { url: true, label: true } },
      agency: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: query.limit ?? 50,
  });
}

/**
 * §3.12's rule analytics — "the primary input for rule tuning".
 *
 * ⚠️ FEATURE DOC 19 WARNS AGAINST TREATING THIS AS "just a report". It is how a
 * false-positive-prone rule is found BEFORE a customer stops believing the
 * findings, and a customer who stops believing the findings churns without ever
 * filing a bug. The rate matters more than the count: a rule that fires twice
 * and is wrong twice is a worse rule than one that fires ten thousand times and
 * is wrong forty.
 */
export async function getRuleAnalytics() {
  const db = adminDb();
  const [issues, feedback] = await Promise.all([
    db.issue.groupBy({
      by: ["ruleId", "severity"],
      _count: { _all: true },
    }),
    db.issueFeedback.groupBy({
      by: ["ruleId", "verdict"],
      _count: { _all: true },
    }),
  ]);

  const rows = new Map<
    string,
    {
      ruleId: string;
      severities: Record<string, number>;
      total: number;
      feedbackTotal: number;
      falsePositives: number;
    }
  >();

  for (const issue of issues) {
    const row = rows.get(issue.ruleId) ?? {
      ruleId: issue.ruleId,
      severities: {},
      total: 0,
      feedbackTotal: 0,
      falsePositives: 0,
    };
    row.severities[issue.severity] = issue._count._all;
    row.total += issue._count._all;
    rows.set(issue.ruleId, row);
  }

  for (const entry of feedback) {
    const row = rows.get(entry.ruleId);
    if (!row) continue;
    row.feedbackTotal += entry._count._all;
    if (entry.verdict === "FALSE_POSITIVE") row.falsePositives += entry._count._all;
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      /*
       * ⚠️ THE DENOMINATOR IS FEEDBACK RECEIVED, NOT ISSUES RAISED. Most issues
       * never get feedback; dividing by every issue would make every rule look
       * near-perfect and hide the one that everybody who bothered to respond
       * said was wrong.
       */
      falsePositiveRate:
        row.feedbackTotal === 0 ? null : row.falsePositives / row.feedbackTotal,
    }))
    .sort((a, b) => (b.falsePositiveRate ?? -1) - (a.falsePositiveRate ?? -1));
}

/**
 * §3.12's "unknown-domain queue — observed domains not matching any vendor,
 * ranked by frequency across tenants".
 *
 * ⚠️ RANKED ACROSS TENANTS, WHICH IS THE ONLY RANKING THAT IS USEFUL. A domain
 * seen on four hundred sites is a vendor we are failing to name four hundred
 * times; the same domain seen once is somebody's bespoke endpoint. Per-tenant
 * ranking would surface the second and bury the first.
 */
export async function getUnknownDomains(limit = 50) {
  const db = adminDb();
  const rows = await db.trackerDetection.groupBy({
    by: ["unknownDomain"],
    where: { vendorId: null, unknownDomain: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { unknownDomain: "desc" } },
    take: limit,
  });
  return rows.map((row) => ({
    domain: row.unknownDomain ?? "",
    occurrences: row._count._all,
  }));
}

export async function listTrackerVendors(limit = 200) {
  const db = adminDb();
  return db.trackerVendor.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: limit,
  });
}

export async function getAiUsageBreakdown() {
  const db = adminDb();
  const month = startOfMonth();

  const [byFeature, byModel, topSpenders, latencies, failures] = await Promise.all([
    db.aIRequest.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: month } },
      _count: { _all: true },
      _sum: { costMicroCents: true, totalTokens: true },
    }),
    db.aIRequest.groupBy({
      by: ["model"],
      where: { createdAt: { gte: month } },
      _count: { _all: true },
      _sum: { costMicroCents: true },
    }),
    db.aIRequest.groupBy({
      by: ["agencyId"],
      where: { createdAt: { gte: month } },
      _sum: { costMicroCents: true },
      orderBy: { _sum: { costMicroCents: "desc" } },
      take: 10,
    }),
    db.aIRequest.findMany({
      where: { createdAt: { gte: month }, latencyMs: { not: null } },
      select: { latencyMs: true },
      orderBy: { latencyMs: "asc" },
    }),
    db.aIRequest.groupBy({
      by: ["status"],
      where: { createdAt: { gte: month } },
      _count: { _all: true },
    }),
  ]);

  const sorted = latencies.map((row) => row.latencyMs ?? 0);
  const percentile = (p: number) =>
    sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;

  const names = await db.agency.findMany({
    where: { id: { in: topSpenders.map((row) => row.agencyId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(names.map((row) => [row.id, row.name]));

  return {
    byFeature,
    byModel,
    topSpenders: topSpenders.map((row) => ({
      agencyId: row.agencyId,
      name: nameById.get(row.agencyId) ?? row.agencyId,
      costMicroCents: row._sum.costMicroCents ?? 0,
    })),
    p50: percentile(0.5),
    p95: percentile(0.95),
    failures,
  };
}

export async function getBillingOverview() {
  const db = adminDb();
  const soon = new Date(Date.now() + 7 * 86_400_000);

  const [subscriptions, trialsEnding, failedPayments, webhookEvents] = await Promise.all([
    db.subscription.findMany({
      include: { plan: true, agency: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.subscription.count({
      where: { status: "TRIALING", trialEndsAt: { lte: soon, gte: new Date() } },
    }),
    db.subscription.count({ where: { status: { in: ["PAST_DUE", "UNPAID"] } } }),
    db.stripeWebhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        stripeEventId: true,
        type: true,
        status: true,
        attempts: true,
        error: true,
        processedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const active = subscriptions.filter(
    (subscription) => subscription.status === "ACTIVE",
  );
  const mrrCents = active.reduce(
    (total, subscription) =>
      total +
      (subscription.interval === "ANNUAL"
        ? Math.round(subscription.plan.priceAnnualCents / 12)
        : subscription.plan.priceMonthlyCents),
    0,
  );

  return {
    subscriptions,
    activeCount: active.length,
    mrrCents,
    arrCents: mrrCents * 12,
    trialsEnding,
    failedPayments,
    webhookEvents,
  };
}

export async function listAdminUsers(search?: string, limit = 100) {
  const db = adminDb();
  return db.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      clerkUserId: true,
      isSuperAdmin: true,
      createdAt: true,
      memberships: {
        select: { role: true, status: true, agency: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listAuditLog(limit = 100) {
  const db = adminDb();
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      actorType: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      agencyId: true,
      user: { select: { email: true } },
    },
  });
}

export async function listSystemLog(level?: string, limit = 100) {
  const db = adminDb();
  return db.systemLog.findMany({
    where: level ? { level } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * §3.12's platform settings, read-only.
 *
 * ⚠️ READ-ONLY IS A DECISION, NOT A GAP. §3.12 lists "plan definitions, default
 * entitlements, scanner defaults, AI model mapping" here, and all four are
 * DEPLOYED CONFIGURATION — the plan catalogue is a constant that the Stripe
 * provisioner also reads, and a form that edited it would desynchronise the
 * prices customers are actually charged from the ones we advertise. Showing an
 * operator what is live, without a save button, is the honest version.
 */
export function getPlatformSettings() {
  return {
    plans: PLAN_CATALOGUE.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyUsd: plan.prices.usd.monthly,
      websites: plan.entitlements.maxWebsites,
      scans: plan.entitlements.maxScansPerMonth,
      credits: plan.entitlements.aiCreditsPerMonth,
      unlimitedSeats: isUnlimited(plan.entitlements.maxTeamMembers),
    })),
    scanner: {
      version: process.env.SCANNER_VERSION ?? "unset",
      concurrency: process.env.SCAN_CONCURRENCY ?? "2",
      blockMedia: process.env.SCAN_BLOCK_MEDIA !== "false",
      respectRobots: process.env.SCAN_RESPECT_ROBOTS !== "false",
      freeScanConcurrency: process.env.FREE_SCAN_CONCURRENCY ?? "1",
    },
    ai: {
      standard: process.env.AI_MODEL_STANDARD ?? "unset",
      advanced: process.env.AI_MODEL_ADVANCED ?? "unset",
      // `AI_API_KEY` is what `packages/ai/src/config.ts` reads — see the note
      // in `admin/health.ts`. This row named a variable nothing else uses.
      configured: Boolean(process.env.AI_API_KEY),
    },
  };
}
