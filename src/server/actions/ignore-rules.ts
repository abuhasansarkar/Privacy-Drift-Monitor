"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * IGNORE-RULE ACTIONS — §3.5.
 *
 * ⚠️ Revoking is the SAME permission as creating (`issue:ignore`). Anyone who
 * can silence a finding must be able to un-silence it — a suppression that only
 * its author can lift becomes permanent the moment they leave.
 */
const input = z.object({ ruleId: z.uuid() });

export async function revokeIgnoreRule(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("issue:ignore");

    const parsed = input.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REVOKE_IGNORE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const revoked = await repos.issues.revokeIgnoreRule(parsed.data.ruleId);
    if (!revoked) {
      throw new ValidationError(t("error.notFound"), {
        reason: `IGNORE_RULE_MISSING:${parsed.data.ruleId}`,
      });
    }

    revalidatePath("/app/settings/ignored");
    return actionOk({ id: parsed.data.ruleId });
  } catch (error) {
    return actionFromError(error, "revokeIgnoreRule");
  }
}
