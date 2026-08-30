"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ConflictError, ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * TEAM ACTIONS — §6.2, Phase 1 task 1.9.
 *
 * ⚠️ AN AGENCY MUST ALWAYS HAVE AN OWNER. The repository refuses the write that
 * would remove the last one; this maps that refusal to a message the user can
 * act on rather than a generic failure. Without the guard an admin can lock the
 * whole agency out of billing with two clicks and no way back.
 */

const roleInput = z.object({
  memberId: z.uuid(),
  // OWNER is assignable — an owner handing over before they leave is the
  // normal case, and forbidding it is what creates the orphan risk.
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "DEVELOPER", "VIEWER"]),
});

export async function setMemberRole(
  raw: z.infer<typeof roleInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("team:role_change");

    const parsed = roleInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "SET_ROLE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const outcome = await repos.team.setRole(parsed.data.memberId, parsed.data.role);

    if (outcome === null) {
      throw new ValidationError(t("error.notFound"), {
        reason: `MEMBER_MISSING:${parsed.data.memberId}`,
      });
    }
    if (outcome === "last-owner") {
      throw new ConflictError(t("team.lastOwner"), { reason: "LAST_OWNER_DEMOTION" });
    }

    revalidatePath("/app/team");
    return actionOk({ id: parsed.data.memberId });
  } catch (error) {
    return actionFromError(error, "setMemberRole");
  }
}

const removeInput = z.object({ memberId: z.uuid() });

export async function removeMember(
  raw: z.infer<typeof removeInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("team:remove");

    const parsed = removeInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REMOVE_MEMBER_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const outcome = await repos.team.remove(parsed.data.memberId);

    if (outcome === null) {
      throw new ValidationError(t("error.notFound"), {
        reason: `MEMBER_MISSING:${parsed.data.memberId}`,
      });
    }
    if (outcome === "last-owner") {
      throw new ConflictError(t("team.lastOwner"), { reason: "LAST_OWNER_REMOVAL" });
    }

    revalidatePath("/app/team");
    return actionOk({ id: parsed.data.memberId });
  } catch (error) {
    return actionFromError(error, "removeMember");
  }
}
