"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * BULK WEBSITE ACTIONS — §3.6, Phase 1 task 1.6.
 *
 * ⚠️ SCOPE IS RE-CHECKED PER ID, not once for the batch. A member restricted to
 * specific websites (§6.2) could otherwise pause the whole portfolio by
 * selecting rows they can see and posting ids they cannot — the ids come from
 * the browser, and the browser is not the authority on what is in scope.
 *
 * ⚠️ A PARTIAL RESULT IS REPORTED AS PARTIAL. If four of five succeed, the
 * action says so rather than throwing away the four or claiming five. Silently
 * skipping the one is how a bulk pause leaves a site still scanning.
 */

const MAX_BATCH = 200;

const bulkInput = z.object({
  websiteIds: z.array(z.uuid()).min(1).max(MAX_BATCH),
  action: z.enum(["pause", "resume", "archive"]),
});

export interface BulkOutcome {
  succeeded: number;
  skipped: number;
}

export async function bulkWebsiteAction(
  raw: z.infer<typeof bulkInput>,
): Promise<ActionResult<BulkOutcome>> {
  try {
    const parsed = bulkInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "BULK_SCHEMA" });
    }

    const permission =
      parsed.data.action === "archive" ? "website:delete" : "website:update";
    const ctx = await requirePermission(permission);
    const repos = repositoriesFor(ctx.agencyId);

    let succeeded = 0;
    let skipped = 0;

    for (const websiteId of parsed.data.websiteIds) {
      // Out of scope, or belongs to another tenant: skipped, never an error.
      // A batch that fails wholesale because one id is stale is worse than one
      // that does the work it can and says what it left.
      if (
        ctx.websiteScope.length > 0 &&
        !ctx.websiteScope.includes(websiteId)
      ) {
        skipped += 1;
        continue;
      }

      const result =
        parsed.data.action === "archive"
          ? await repos.websites.archive(websiteId, { userId: ctx.userId })
          : await repos.websites.setMonitoring(
              websiteId,
              parsed.data.action === "pause" ? "PAUSED" : "ACTIVE",
              // `nextScanAt` is the single scheduling signal (§7.5): pausing
              // nulls it, resuming makes the site due now.
              parsed.data.action === "pause" ? null : new Date(),
              { userId: ctx.userId },
            );

      if (result) succeeded += 1;
      else skipped += 1;
    }

    revalidatePath("/app/websites");
    revalidatePath("/app");
    return actionOk({ succeeded, skipped });
  } catch (error) {
    return actionFromError(error, "bulkWebsiteAction");
  }
}
