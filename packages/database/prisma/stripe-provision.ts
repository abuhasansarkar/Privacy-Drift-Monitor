/**
 * STRIPE PRODUCT & PRICE PROVISIONING — PLAN.md Part IX §9.1, §9.3.
 *
 *     npx tsx --env-file=.env packages/database/prisma/stripe-provision.ts
 *     …                                                          --dry-run
 *
 * Creates one Stripe Product per plan and, per §9.1, "two per product (monthly,
 * annual) × three currencies (USD, GBP, EUR) = 24 prices", then writes the ids
 * back onto `Plan` — USD on the row, the rest into `currencyPrices`.
 *
 * ⚠️ IDEMPOTENT VIA `lookup_key`, NOT VIA "does a product named X exist".
 * Re-running must not create a second Starter product and a second set of
 * prices; Stripe has no unique constraint on a product name, so matching on one
 * is how an account ends up with four Starters and a customer subscribed to the
 * wrong one. Every price carries a deterministic `lookup_key`
 * (`pdm_<plan>_<interval>_<currency>`) and the script looks that up first.
 *
 * ⚠️ A STRIPE PRICE IS IMMUTABLE. You cannot edit an amount — §9.3's prices are
 * fixed at creation, and a price change means creating a NEW price and moving
 * customers to it. So this script never updates an existing price; if the
 * amount in `Plan` no longer matches Stripe it says so loudly and changes
 * nothing, because silently creating a second price at a new amount while the
 * old one still bills existing customers is how two customers on "Growth" end
 * up paying different money with no record of why.
 *
 * ⚠️ GBP AND EUR AMOUNTS ARE §9.3's PUBLISHED DISPLAY PRICES, not conversions.
 * §9.3 lists them explicitly (£119 / €139 for Growth), and they are round
 * numbers chosen for the price page — recomputing them from an exchange rate
 * would produce £117.43 and make the pricing page wrong the day rates move.
 */

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

/** §9.3's table, in minor units. Monthly / annual (2 months free). */
const PRICES: Record<string, Record<string, { monthly: number; annual: number }>> = {
  starter: {
    usd: { monthly: 4_900, annual: 49_000 },
    gbp: { monthly: 3_900, annual: 39_000 },
    eur: { monthly: 4_500, annual: 45_000 },
  },
  growth: {
    usd: { monthly: 14_900, annual: 149_000 },
    gbp: { monthly: 11_900, annual: 119_000 },
    eur: { monthly: 13_900, annual: 139_000 },
  },
  agency: {
    usd: { monthly: 34_900, annual: 349_000 },
    gbp: { monthly: 27_900, annual: 279_000 },
    eur: { monthly: 32_500, annual: 325_000 },
  },
  scale: {
    usd: { monthly: 79_900, annual: 799_000 },
    gbp: { monthly: 63_900, annual: 639_000 },
    eur: { monthly: 74_500, annual: 745_000 },
  },
};

const CURRENCIES = ["usd", "gbp", "eur"] as const;
const INTERVALS = [
  { key: "monthly", stripe: "month" as const, count: 1 },
  { key: "annual", stripe: "year" as const, count: 1 },
];

function lookupKey(planKey: string, interval: string, currency: string): string {
  return `pdm_${planKey}_${interval}_${currency}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it to .env and re-run.");
  }

  /*
   * ⚠️ A LIVE KEY REQUIRES AN EXPLICIT OPT-IN. This script creates billable
   * objects. Running it against live by accident — a copied .env, a wrong
   * shell — publishes real prices customers can be charged against.
   */
  if (apiKey.startsWith("sk_live_") && !process.argv.includes("--live")) {
    throw new Error(
      "STRIPE_SECRET_KEY is a LIVE key. Re-run with --live if you really mean it.",
    );
  }

  const stripe = new Stripe(apiKey, { apiVersion: "2026-08-26.dahlia" });
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  if (plans.length === 0) throw new Error("No plans. Run `npm run db:seed` first.");

  console.log(
    `${dryRun ? "DRY RUN — " : ""}provisioning ${plans.length} plans in ${apiKey.startsWith("sk_live_") ? "LIVE" : "TEST"} mode\n`,
  );

  const mismatches: string[] = [];

  for (const plan of plans) {
    const amounts = PRICES[plan.key];
    if (!amounts) {
      console.log(`  ${plan.key.padEnd(9)} SKIP — no §9.3 price defined`);
      continue;
    }

    // ── Product ──────────────────────────────────────────────────────────
    let productId = plan.stripeProductId;
    if (productId) {
      // Verify it still exists; a deleted product makes every price unusable.
      const existing = await stripe.products.retrieve(productId).catch(() => null);
      if (!existing || existing.deleted) productId = null;
    }
    if (!productId) {
      const found = await stripe.products.search({
        query: `metadata['pdm_plan_key']:'${plan.key}'`,
        limit: 1,
      });
      productId = found.data[0]?.id ?? null;
    }
    if (!productId) {
      if (dryRun) {
        console.log(`  ${plan.key.padEnd(9)} would CREATE product`);
        productId = "prod_dryrun";
      } else {
        const product = await stripe.products.create({
          name: `Privacy Drift Monitor — ${plan.name}`,
          description: plan.description ?? undefined,
          metadata: { pdm_plan_key: plan.key },
        });
        productId = product.id;
        console.log(`  ${plan.key.padEnd(9)} created product ${productId}`);
      }
    }

    // ── Prices ───────────────────────────────────────────────────────────
    const currencyPrices: Record<string, { monthly?: string; annual?: string }> = {};
    let usdMonthly: string | null = null;
    let usdAnnual: string | null = null;

    for (const currency of CURRENCIES) {
      const forCurrency = amounts[currency];
      if (!forCurrency) continue;

      for (const interval of INTERVALS) {
        const key = lookupKey(plan.key, interval.key, currency);
        const amount = forCurrency[interval.key as "monthly" | "annual"];

        const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
        let priceId = found.data[0]?.id ?? null;

        if (priceId) {
          const existing = found.data[0]!;
          /*
           * ⚠️ A PRICE IS IMMUTABLE. If Stripe disagrees with §9.3 we report and
           * change NOTHING — creating a second price at the new amount while
           * the old one still bills existing customers produces two customers
           * on "Growth" paying different money with no record of why. Moving a
           * price is a deliberate migration, not a side effect of a seed.
           */
          if (existing.unit_amount !== amount) {
            mismatches.push(
              `${key}: Stripe has ${existing.unit_amount}, §9.3 says ${amount}`,
            );
          }
        } else if (dryRun) {
          console.log(`             would CREATE ${key} = ${amount} ${currency}`);
          priceId = `price_dryrun_${key}`;
        } else {
          const price = await stripe.prices.create({
            product: productId,
            currency,
            unit_amount: amount,
            recurring: { interval: interval.stripe, interval_count: interval.count },
            lookup_key: key,
            metadata: { pdm_plan_key: plan.key, pdm_interval: interval.key },
          });
          priceId = price.id;
          console.log(`             created ${key} = ${amount} ${currency}`);
        }

        if (currency === "usd") {
          if (interval.key === "monthly") usdMonthly = priceId;
          else usdAnnual = priceId;
        } else {
          currencyPrices[currency] ??= {};
          currencyPrices[currency]![interval.key as "monthly" | "annual"] = priceId;
        }
      }
    }

    if (!dryRun) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          stripeProductId: productId,
          stripePriceMonthlyId: usdMonthly,
          stripePriceAnnualId: usdAnnual,
          currencyPrices,
        },
      });
    }
  }

  if (mismatches.length > 0) {
    console.log("\n⚠️  PRICE MISMATCHES — nothing was changed:");
    for (const line of mismatches) console.log(`   ${line}`);
    console.log(
      "\n   A Stripe price cannot be edited. To change an amount, create a new\n" +
        "   price and migrate subscriptions to it deliberately.",
    );
  }

  console.log(`\n${dryRun ? "Dry run complete — nothing was created." : "Done."}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Provisioning failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
