"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";
import { requirePermission } from "@/server/auth/context";
import { previewCsv, type ImportPreview } from "@/server/services/csv-import";
import { createWebsite } from "./websites";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * CSV IMPORT ACTIONS — §3.6, Phase 1 task 1.6.
 *
 * ⚠️ IMPORT RE-PARSES THE FILE; it does not trust a preview the browser sends
 * back. The preview is a rendering, and anything round-tripping through the
 * client is caller-supplied — accepting it would let someone post a "ready" row
 * for an address the guard rejected.
 */

const MAX_BYTES = 512 * 1024;
const MAX_ROWS = 500;

const csvInput = z.object({
  csv: z.string().min(1).max(MAX_BYTES),
});

export async function previewWebsiteCsv(
  raw: z.infer<typeof csvInput>,
): Promise<ActionResult<ImportPreview>> {
  try {
    const ctx = await requirePermission("website:create");
    const parsed = csvInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("import.tooLarge"), { reason: "CSV_SCHEMA" });
    }
    return actionOk(await previewCsv(ctx, parsed.data.csv));
  } catch (error) {
    return actionFromError(error, "previewWebsiteCsv");
  }
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
}

export async function importWebsiteCsv(
  raw: z.infer<typeof csvInput>,
): Promise<ActionResult<ImportResult>> {
  try {
    const ctx = await requirePermission("website:create");
    const parsed = csvInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("import.tooLarge"), { reason: "CSV_SCHEMA" });
    }

    const log = childLogger({ agencyId: ctx.agencyId, userId: ctx.userId });
    const preview = await previewCsv(ctx, parsed.data.csv);

    const importable = preview.rows
      .filter((row) => row.status === "ready" || row.status === "client-new")
      .slice(0, MAX_ROWS);

    const repos = repositoriesFor(ctx.agencyId);
    const result: ImportResult = { created: 0, skipped: 0, failed: 0 };

    // Clients referenced by name are created ONCE, before the loop — creating
    // them per row would race on the (agencyId, slug) unique index and turn a
    // legitimate import into a string of conflicts.
    const clientIds = new Map<string, string>();
    for (const name of new Set(
      importable.map((row) => row.clientName).filter((name): name is string => !!name),
    )) {
      const existing = await repos.db.client.findFirst({
        where: { name, archivedAt: null },
        select: { id: true },
      });
      if (existing) {
        clientIds.set(name, existing.id);
        continue;
      }
      const created = await repos.clients.create({ name }, { userId: ctx.userId });
      clientIds.set(name, created.id);
    }

    for (const row of importable) {
      /*
       * ⚠️ EVERY ROW GOES THROUGH `createWebsite`, which re-runs normalization,
       * the SSRF guard, the duplicate check and the entitlement gate. Writing
       * rows directly here would make a CSV upload the one path into the
       * database that skips the security boundary (§10.3).
       */
      const outcome = await createWebsite({
        url: row.rawUrl,
        scanFrequency: "WEEKLY",
        scanPriority: "NORMAL",
        monitoredPaths: ["/"],
        alertProfile: "DEFAULT",
        runInitialScan: true,
        ...(row.clientName && clientIds.has(row.clientName)
          ? { clientId: clientIds.get(row.clientName)! }
          : {}),
      });

      if (outcome.ok) result.created += 1;
      else if (outcome.code === "CONFLICT") result.skipped += 1;
      else result.failed += 1;
    }

    log.info(result, "csv import finished");
    revalidatePath("/app/websites");
    return actionOk(result);
  } catch (error) {
    return actionFromError(error, "importWebsiteCsv");
  }
}
