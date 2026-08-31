"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { triggerScan } from "@/server/services/scan-service";
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

const bulkInput = z
  .object({
    websiteIds: z.array(z.uuid()).min(1).max(MAX_BATCH),
    action: z.enum(["pause", "resume", "archive", "scan", "assignClient", "assignGroup"]),
    /** `null` clears the assignment — "remove from group" is a real request. */
    clientId: z.uuid().nullable().optional(),
    groupId: z.uuid().nullable().optional(),
    /** Creates the group if it does not exist — see `findOrCreateGroup`. */
    groupName: z.string().trim().min(1).max(60).optional(),
  })
  .refine(
    (input) =>
      input.action !== "assignGroup" ||
      input.groupId !== undefined ||
      input.groupName !== undefined,
    { message: "Choose a group or name a new one", path: ["groupId"] },
  );

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

    /*
     * ⚠️ THE PERMISSION DEPENDS ON THE ACTION (§3.5): archive is Admin+,
     * "scan now" is Developer+, and the rest are Manager+. One gate for the
     * whole endpoint would either block a developer from scanning or let a
     * manager archive a portfolio.
     */
    const permission =
      parsed.data.action === "archive"
        ? "website:delete"
        : parsed.data.action === "scan"
          ? "scan:trigger"
          : "website:update";
    const ctx = await requirePermission(permission);
    const repos = repositoriesFor(ctx.agencyId);

    // Scope-filtered up front for the set-based actions below; the per-id loop
    // applies the same rule for the row-by-row ones.
    const inScope = parsed.data.websiteIds.filter(
      (id) => ctx.websiteScope.length === 0 || ctx.websiteScope.includes(id),
    );
    const outOfScope = parsed.data.websiteIds.length - inScope.length;

    if (parsed.data.action === "assignClient" || parsed.data.action === "assignGroup") {
      let target: string | null = null;

      if (parsed.data.action === "assignGroup") {
        // A typed name creates the group; an id selects an existing one. This
        // is the only path that creates a group — see the repository note.
        target = parsed.data.groupName
          ? (await repos.websites.findOrCreateGroup(parsed.data.groupName)).id
          : (parsed.data.groupId ?? null);
      } else {
        target = parsed.data.clientId ?? null;
      }

      const moved =
        parsed.data.action === "assignGroup"
          ? await repos.websites.assignGroup(inScope, target)
          : await repos.websites.assignClient(inScope, target);

      await repos.audit.record({
        action: "website.updated",
        entityType: "website",
        entityId: inScope.join(","),
        userId: ctx.userId,
        after: { [parsed.data.action]: target, count: moved },
      });

      revalidatePath("/app/websites");
      return actionOk({ succeeded: moved, skipped: outOfScope + (inScope.length - moved) });
    }

    if (parsed.data.action === "scan") {
      let queued = 0;
      for (const websiteId of inScope) {
        try {
          await triggerScan({
            agencyId: ctx.agencyId,
            websiteId,
            userId: ctx.userId,
            trigger: "MANUAL",
          });
          queued += 1;
        } catch {
          /*
           * A site already scanning, paused, or over the plan's capacity is
           * SKIPPED, not fatal. §3.5 expects "12 of 15 queued" rather than an
           * error that discards the twelve.
           */
        }
      }
      revalidatePath("/app/websites");
      return actionOk({ succeeded: queued, skipped: parsed.data.websiteIds.length - queued });
    }

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
