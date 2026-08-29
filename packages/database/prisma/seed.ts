/**
 * Database seed — idempotent. Safe to re-run on every migration.
 *
 * Seeds the three GLOBAL tables that the product cannot function without:
 *   1. TrackerVendor — without it every third party reads "unknown" (§12.6 launch checklist)
 *   2. Plan          — entitlements resolve from here (§9.2)
 *   3. FeatureFlag   — kill switches must exist before the features they gate (§11.13)
 *
 * Run: pnpm db:seed
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type SeedVendor = Omit<
  Prisma.TrackerVendorCreateInput,
  "createdAt" | "updatedAt" | "isActive"
>;

async function seedTrackerVendors() {
  const file = join(__dirname, "seed", "trackers.json");
  const vendors = JSON.parse(readFileSync(file, "utf8")) as SeedVendor[];

  for (const vendor of vendors) {
    await prisma.trackerVendor.upsert({
      where: { slug: vendor.slug },
      create: { ...vendor, isActive: true },
      // Deliberately does NOT overwrite admin edits to category/risk — those are
      // curated decisions (§4.8 essential-service handling). Only pattern data,
      // which is factual, is refreshed from the seed file.
      update: {
        name: vendor.name,
        vendorCompany: vendor.vendorCompany,
        domainPatterns: vendor.domainPatterns,
        scriptPatterns: vendor.scriptPatterns,
        cookiePatterns: vendor.cookiePatterns,
        storagePatterns: vendor.storagePatterns,
        requestPathPatterns: vendor.requestPathPatterns,
        documentationUrl: vendor.documentationUrl,
        privacyPolicyUrl: vendor.privacyPolicyUrl,
        dataProcessingLocation: vendor.dataProcessingLocation,
        aliases: vendor.aliases,
      },
    });
  }

  console.log(`  ✓ ${vendors.length} tracker vendors`);
}

/**
 * Plans. Prices are USD minor units (PLAN.md §9.3). Stripe price ids are filled
 * in during Phase 6 — until then checkout is unavailable, which is correct.
 */
const PLANS = [
  {
    key: "starter",
    name: "Starter",
    description: "For agencies getting started with privacy monitoring.",
    sortOrder: 1,
    priceMonthlyCents: 4900,
    priceAnnualCents: 49000,
    entitlements: {
      maxWebsites: 10,
      maxTeamMembers: 2,
      maxClients: 10,
      scanFrequencies: ["WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 60,
      maxPagesPerScan: 1,
      maxConcurrentScans: 1,
      scanPriority: "NORMAL",
      aiCreditsPerMonth: 50,
      aiAdvancedTier: false,
      whiteLabel: false,
      clientPortal: false,
      maxPortalUsers: 0,
      reportTypes: ["SCAN", "WEBSITE_HEALTH"],
      maxReportsPerMonth: 10,
      evidenceRetentionDays: 30,
      scanHistoryRetentionDays: 365,
      slackIntegration: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "growth",
    name: "Growth",
    description: "Daily scanning and white-label reports. The one most agencies pick.",
    sortOrder: 2,
    priceMonthlyCents: 14900,
    priceAnnualCents: 149000,
    entitlements: {
      maxWebsites: 40,
      maxTeamMembers: 6,
      maxClients: 40,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 400,
      maxPagesPerScan: 3,
      maxConcurrentScans: 2,
      scanPriority: "NORMAL",
      aiCreditsPerMonth: 300,
      aiAdvancedTier: false,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: 10,
      reportTypes: ["SCAN", "ISSUE", "MONTHLY_MONITORING", "WEBSITE_HEALTH", "PRIVACY_DRIFT"],
      maxReportsPerMonth: 50,
      evidenceRetentionDays: 90,
      scanHistoryRetentionDays: 730,
      slackIntegration: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "agency",
    name: "Agency",
    description: "Larger portfolios, advanced AI, priority support.",
    sortOrder: 3,
    priceMonthlyCents: 34900,
    priceAnnualCents: 349000,
    entitlements: {
      maxWebsites: 120,
      maxTeamMembers: 15,
      maxClients: 120,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 1500,
      maxPagesPerScan: 5,
      maxConcurrentScans: 4,
      scanPriority: "HIGH",
      aiCreditsPerMonth: 1000,
      aiAdvancedTier: true,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: 50,
      reportTypes: ["SCAN", "ISSUE", "MONTHLY_MONITORING", "WEBSITE_HEALTH", "PRIVACY_DRIFT"],
      maxReportsPerMonth: 200,
      evidenceRetentionDays: 180,
      scanHistoryRetentionDays: 1095,
      slackIntegration: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
  {
    key: "scale",
    name: "Scale",
    description: "For agencies managing hundreds of client websites.",
    sortOrder: 4,
    priceMonthlyCents: 79900,
    priceAnnualCents: 799000,
    entitlements: {
      maxWebsites: 400,
      maxTeamMembers: -1,
      maxClients: -1,
      scanFrequencies: ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"],
      maxScansPerMonth: 6000,
      maxPagesPerScan: 10,
      maxConcurrentScans: 8,
      scanPriority: "HIGH",
      aiCreditsPerMonth: 4000,
      aiAdvancedTier: true,
      whiteLabel: true,
      clientPortal: true,
      maxPortalUsers: -1,
      reportTypes: ["SCAN", "ISSUE", "MONTHLY_MONITORING", "WEBSITE_HEALTH", "PRIVACY_DRIFT"],
      maxReportsPerMonth: -1,
      evidenceRetentionDays: 365,
      scanHistoryRetentionDays: 1095,
      slackIntegration: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
] as const;

async function seedPlans() {
  for (const plan of PLANS) {
    const { entitlements, ...rest } = plan;
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: { ...rest, currency: "usd", isPublic: true, entitlements },
      update: { ...rest, entitlements },
    });
  }
  console.log(`  ✓ ${PLANS.length} plans`);
}

/**
 * Feature flags. All default to disabled — a flag must be turned on deliberately.
 * The AI and scan flags double as operational kill switches (§11.13).
 */
const FLAGS = [
  { key: "ai_assistant_page", description: "The /app/ai task panel" },
  { key: "ai_auto_explain", description: "KILL SWITCH: auto-explain critical issues. Off stops all automatic AI spend instantly." },
  { key: "slack_integration", description: "Slack alert channel (V1.1)" },
  { key: "webhooks", description: "Outbound webhooks (V1.1)" },
  { key: "client_portal", description: "Client-facing read-only portal" },
  { key: "advanced_scan", description: "KILL SWITCH: multi-page / deeper scanning. Off reduces scanner load during an incident." },
  { key: "cmp_adapter_experimental", description: "Unreleased CMP adapters" },
  { key: "scoring_engine_v2", description: "Shadow-mode scoring rollout: compute both, store both, compare, then flip." },
  { key: "nl_search", description: "Natural-language portfolio search (V2)" },
  { key: "copilot", description: "Privacy Copilot (V2)" },
];

async function seedFeatureFlags() {
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { ...flag, enabled: false, rolloutPercent: 0 },
      update: { description: flag.description },
    });
  }
  console.log(`  ✓ ${FLAGS.length} feature flags`);
}

async function main() {
  console.log("Seeding…");
  await seedTrackerVendors();
  await seedPlans();
  await seedFeatureFlags();
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
