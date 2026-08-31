"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * AI SETTINGS — PLAN.md Part VIII §8.3, §8.9, Phase 5 task 5.8.
 *
 * ⚠️ `ai:configure`, NOT `ai:generate`. These switches decide what the agency
 * SPENDS and which model tier it pays for; §6.1 puts them at Admin level, above
 * the permission that merely uses the feature.
 */

const aiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  /**
   * ⚠️ THE MAIN UNCONTROLLED COST VECTOR (feature doc 16's trap list).
   * Auto-explaining every Critical issue is an opt-in, and `resolveAiSettings`
   * treats an absent row as "not opted in" regardless of the schema default —
   * so this checkbox is the only way it turns on.
   */
  autoExplainCritical: z.boolean(),
  modelTier: z.enum(["STANDARD", "ADVANCED"]),
  /**
   * `null` means "no cap", which is what billing supplies in Phase 6. A cap of
   * 0 is a real, meaningful value — "no AI spend this period" — and must not be
   * coerced to `null` by a falsy check anywhere downstream.
   */
  monthlyCreditCap: z.number().int().min(0).max(1_000_000).nullable(),
  featureToggles: z.record(z.string(), z.boolean()).default({}),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export async function saveAiSettings(
  raw: AiSettingsInput,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const ctx = await requirePermission("ai:configure");

    const parsed = aiSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "AI_SETTINGS_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    await repos.ai.upsertSettings({
      aiEnabled: parsed.data.aiEnabled,
      autoExplainCritical: parsed.data.autoExplainCritical,
      modelTier: parsed.data.modelTier,
      monthlyCreditCap: parsed.data.monthlyCreditCap,
      featureToggles: parsed.data.featureToggles,
    });

    /*
     * ⚠️ AUDITED. Turning AI off, or raising a credit cap, is a spending
     * decision somebody will need to attribute later — the same reason
     * `issue:ignore` is audited.
     */
    await repos.audit.record({
      action: "ai.settings.updated",
      entityType: "agency",
      entityId: ctx.agencyId,
      userId: ctx.userId,
      actorType: "user",
      // Only the fields that decide spend — §10.6 minimisation. `featureToggles`
      // is deliberately absent: it is a per-feature on/off map, not a limit.
      after: {
        aiEnabled: parsed.data.aiEnabled,
        autoExplainCritical: parsed.data.autoExplainCritical,
        modelTier: parsed.data.modelTier,
        monthlyCreditCap: parsed.data.monthlyCreditCap,
      },
    });

    revalidatePath("/app/settings/ai");
    return actionOk({ saved: true });
  } catch (error) {
    return actionFromError(error, "saveAiSettings");
  }
}
