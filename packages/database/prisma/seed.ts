/**
 * Database seed — idempotent. Safe to re-run on every migration.
 *
 * Seeds the three GLOBAL tables that the product cannot function without:
 *   1. TrackerVendor — without it every third party reads "unknown" (§12.6 launch checklist)
 *   2. Plan          — entitlements resolve from here (§9.2)
 *   3. FeatureFlag   — kill switches must exist before the features they gate (§11.13)
 *
 * Run: npm run db:seed
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PLAN_CATALOGUE } from "@pdm/billing";

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
 * Plans. §9.3's table lives in `@pdm/billing`'s catalogue — see the note there
 * about the three copies this replaced. The seed's job is to project that
 * catalogue into the `Plan` table, not to restate it.
 *
 * ⚠️ THE SEED WRITES USD INTO `priceMonthlyCents`, and the localized amounts
 * reach Stripe (not this table) through `stripe-provision.ts`. §9.1 stores only
 * the USD figures on the row; `currencyPrices` holds Stripe PRICE IDS, not
 * amounts, and is written by the provisioner.
 */
async function seedPlans() {
  for (const plan of PLAN_CATALOGUE) {
    const row = {
      key: plan.key,
      name: plan.name,
      description: plan.description,
      sortOrder: plan.sortOrder,
      priceMonthlyCents: plan.prices.usd.monthly,
      priceAnnualCents: plan.prices.usd.annual,
      entitlements: plan.entitlements as unknown as Prisma.InputJsonValue,
    };
    await prisma.plan.upsert({
      where: { key: plan.key },
      /*
       * ⚠️ `update` DOES NOT TOUCH THE STRIPE ID COLUMNS. Re-running the seed
       * after provisioning must not blank `stripeProductId` / `currencyPrices`
       * — that would silently make checkout unavailable for every plan, and the
       * only symptom would be "billing temporarily unavailable" on a page that
       * looks otherwise healthy.
       */
      create: { ...row, currency: "usd", isPublic: true },
      update: row,
    });
  }
  console.log(`  ✓ ${PLAN_CATALOGUE.length} plans`);
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
