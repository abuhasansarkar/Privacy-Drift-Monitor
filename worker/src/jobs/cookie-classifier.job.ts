import { unsafeGlobalClient } from "@pdm/database";
import { classifyCookie, type CookieClassifyOutput } from "@pdm/ai";
import { childLogger } from "@pdm/shared/logger";

/**
 * COOKIE CLASSIFICATION WORKER JOB — Phase 17 task 17.5.
 *
 * Runs after scan completion to classify unclassified / unknown cookies.
 * Checks known vendor patterns, queries the in-memory/provider cache,
 * and updates `CookieRecord.category` and `trackerVendorId` in the database.
 */

const db = unsafeGlobalClient("cookie classification worker job");
const log = childLogger({ component: "cookie-classifier-job" });

export interface CookieClassifierJobInput {
  agencyId: string;
  websiteId: string;
  scanId: string;
}

export interface CookieClassifierJobResult {
  scanId: string;
  totalProcessed: number;
  updatedCount: number;
}

export interface CookieClassifierDeps {
  db?: {
    cookieRecord: {
      findMany: (args: unknown) => Promise<Array<{ id: string; name: string; domain: string; durationDays: number | null }>>;
      updateMany: (args: unknown) => Promise<{ count: number }>;
    };
  };
  classifier?: (input: { name: string; domain: string; durationDays?: number | null }) => Promise<CookieClassifyOutput>;
}

export async function runCookieClassification(
  input: CookieClassifierJobInput,
  deps: CookieClassifierDeps = {},
): Promise<CookieClassifierJobResult> {
  const database = deps.db ?? db;
  const { agencyId, scanId } = input;

  // 1. Fetch unclassified cookies for this scan
  const unclassified = await database.cookieRecord.findMany({
    where: {
      scanId,
      agencyId,
      category: "UNKNOWN",
    },
    select: {
      id: true,
      name: true,
      domain: true,
      durationDays: true,
    },
  });

  if (unclassified.length === 0) {
    return { scanId, totalProcessed: 0, updatedCount: 0 };
  }

  log.info(
    { scanId, count: unclassified.length },
    "starting cookie classification for unclassified cookies",
  );

  // 2. Group by unique (name, domain) to minimize classifications
  const uniqueMap = new Map<string, { name: string; domain: string; durationDays?: number | null; ids: string[] }>();
  for (const c of unclassified) {
    const key = `${c.name.toLowerCase()}::${c.domain.toLowerCase()}`;
    const existing = uniqueMap.get(key);
    if (existing) {
      existing.ids.push(c.id);
    } else {
      uniqueMap.set(key, {
        name: c.name,
        domain: c.domain,
        durationDays: c.durationDays,
        ids: [c.id],
      });
    }
  }

  let updatedCount = 0;

  for (const [, item] of uniqueMap) {
    try {
      const result = deps.classifier
        ? await deps.classifier({
            name: item.name,
            domain: item.domain,
            durationDays: item.durationDays,
          })
        : await classifyCookie({
            name: item.name,
            domain: item.domain,
            durationDays: item.durationDays,
          });

      if (result) {
        await database.cookieRecord.updateMany({
          where: {
            id: { in: item.ids },
            scanId,
            agencyId,
          },
          data: {
            category: result.category,
            trackerVendorId: result.vendorName !== "First Party" ? result.vendorName : null,
          },
        });
        updatedCount += item.ids.length;
      }
    } catch (err) {
      log.warn({ err, cookie: item.name }, "failed to classify single cookie");
    }
  }

  log.info(
    { scanId, totalProcessed: unclassified.length, updatedCount },
    "cookie classification job finished",
  );

  return {
    scanId,
    totalProcessed: unclassified.length,
    updatedCount,
  };
}
