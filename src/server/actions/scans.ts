"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requireWebsiteAccess } from "@/server/auth/context";
import { triggerScan } from "@/server/services/scan-service";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * SCAN ACTIONS — §3.6, §7.3, Phase 2 task 2.13.
 *
 * ⚠️ `requireWebsiteAccess` re-checks authorization inside the action, and uses
 * the website-scoped gate rather than the agency one: a member restricted to
 * specific sites must not be able to spend a browser slot on a site they cannot
 * see (§6.2). Out-of-scope raises NOT_FOUND, never FORBIDDEN.
 */

const input = z.object({ websiteId: z.uuid() });

export async function startScan(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ scanId: string }>> {
  try {
    const parsed = input.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "START_SCAN_SCHEMA" });
    }

    // "Scan now" is Developer+ (§6.2), which `scan:trigger` encodes.
    const ctx = await requireWebsiteAccess(parsed.data.websiteId, "scan:trigger");

    const { scanId } = await triggerScan({
      agencyId: ctx.agencyId,
      websiteId: parsed.data.websiteId,
      userId: ctx.userId,
      trigger: "MANUAL",
    });

    revalidatePath(`/app/websites/${parsed.data.websiteId}`);
    return actionOk({ scanId });
  } catch (error) {
    return actionFromError(error, "startScan");
  }
}
