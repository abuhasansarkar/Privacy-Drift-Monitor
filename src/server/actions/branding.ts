"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { invalidateBranding } from "@pdm/reports/branding";
import { branding as brandingSchemas } from "@pdm/schemas";
import { checkBrandColor, type ContrastCheck } from "@pdm/shared/branding";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * BRANDING ACTION — §6.9, §11.6.
 *
 * ⚠️ CONTRAST IS VALIDATED AT SAVE TIME AND A FAILING COLOUR IS REJECTED
 * (§6.9). Accepting a pale accent produces an unreadable PDF that the agency
 * has already emailed to their client before anyone notices — and fixing it
 * then means regenerating documents that are already out in the world.
 *
 * ⚠️ THE CACHE IS INVALIDATED ON SAVE, keyed only by `agencyId`. Skipping this
 * would leave up to five minutes of reports rendering with the old brand; using
 * any other key is the leakage bug §6.9 exists to prevent.
 */

function describe(checks: ContrastCheck[]): string {
  const failing = checks.filter((check) => !check.passes);
  if (failing.length === 0) return t("branding.contrastFails");
  return failing
    .map(
      (check) =>
        `${check.ratio}:1 ${t("branding.contrastAgainst")} ${check.against} (needs ${check.required}:1)`,
    )
    .join(" · ");
}

export async function saveBranding(
  raw: z.infer<typeof brandingSchemas.brandingSchema>,
): Promise<ActionResult<{ agencyId: string }>> {
  try {
    const ctx = await requirePermission("branding:update");

    const parsed = brandingSchemas.brandingSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "BRANDING_SCHEMA" },
      );
    }

    // ⚠️ Field-scoped, so the form can mark the offending swatch rather than
    // showing one message above a two-colour picker.
    const fieldErrors: Record<string, string> = {};
    const primary = checkBrandColor(parsed.data.primaryColor);
    if (!primary.valid) fieldErrors.primaryColor = describe(primary.checks);
    const accent = checkBrandColor(parsed.data.accentColor);
    if (!accent.valid) fieldErrors.accentColor = describe(accent.checks);

    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: t("branding.contrastFails"),
        fieldErrors,
      };
    }

    const repos = repositoriesFor(ctx.agencyId);
    const before = await repos.branding.find();
    await repos.branding.upsert(parsed.data);

    await repos.audit.record({
      action: "branding.updated",
      entityType: "agency_branding",
      entityId: ctx.agencyId,
      userId: ctx.userId,
      before: before
        ? { primaryColor: before.primaryColor, companyName: before.companyName }
        : null,
      after: {
        primaryColor: parsed.data.primaryColor,
        companyName: parsed.data.companyName,
      },
    });

    invalidateBranding(ctx.agencyId);

    revalidatePath("/app/settings/branding");
    // Reports and the portal both render branding, so their pages are stale too.
    revalidatePath("/app/reports", "layout");
    return actionOk({ agencyId: ctx.agencyId });
  } catch (error) {
    return actionFromError(error, "saveBranding");
  }
}
