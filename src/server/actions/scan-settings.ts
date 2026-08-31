"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { website as websiteSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * SCAN SETTINGS ACTION — §3.11, Phase 4 task 4.9.
 *
 * ⚠️ `settings:update` IS ADMIN+ (§6.2). These defaults decide how much browser
 * time the agency spends and how long evidence survives — both are commercial
 * decisions, not per-user preferences.
 *
 * ⚠️ TURNING OFF `respectRobots` IS AUDIT-LOGGED SPECIFICALLY. It is the one
 * setting here that changes what we are willing to do to somebody else's
 * server, and "who turned that off, and when" has to be answerable.
 */
export async function saveScanSettings(
  raw: z.infer<typeof websiteSchemas.agencyScanSettingsSchema>,
): Promise<ActionResult<{ agencyId: string }>> {
  try {
    const ctx = await requirePermission("settings:update");

    const parsed = websiteSchemas.agencyScanSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "SCAN_SETTINGS_SCHEMA" },
      );
    }

    const repos = repositoriesFor(ctx.agencyId);
    const before = await repos.websites.scanSettings();
    await repos.websites.saveScanSettings(parsed.data);

    await repos.audit.record({
      action: "agency.updated",
      entityType: "agency_scan_settings",
      entityId: ctx.agencyId,
      userId: ctx.userId,
      before: before
        ? {
            respectRobots: before.respectRobots,
            screenshotPolicy: before.screenshotPolicy,
            evidenceRetentionDays: before.evidenceRetentionDays,
          }
        : null,
      after: {
        respectRobots: parsed.data.respectRobots,
        screenshotPolicy: parsed.data.screenshotPolicy,
        evidenceRetentionDays: parsed.data.evidenceRetentionDays,
      },
    });

    revalidatePath("/app/settings/scanning");
    return actionOk({ agencyId: ctx.agencyId });
  } catch (error) {
    return actionFromError(error, "saveScanSettings");
  }
}
