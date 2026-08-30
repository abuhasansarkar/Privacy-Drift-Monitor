"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { issue as issueSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * ISSUE ACTIONS — §6.5, Phase 3 tasks 3.4/3.5.
 *
 * ⚠️ Authorization is re-checked inside every action (§6.1), and the two
 * permissions are deliberately different: acknowledging is routine triage,
 * while ignoring suppresses a finding from every future scan and is Manager+.
 */

export async function setIssueStatus(
  raw: z.infer<typeof issueSchemas.setIssueStatusSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("issue:transition");

    const parsed = issueSchemas.setIssueStatusSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "ISSUE_STATUS_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const updated = await repos.issues.setStatus(
      parsed.data.issueId,
      parsed.data.status,
      ctx.userId,
    );
    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `ISSUE_MISSING:${parsed.data.issueId}`,
      });
    }

    revalidatePath("/app/issues");
    revalidatePath(`/app/issues/${parsed.data.issueId}`);
    return actionOk({ id: updated.id });
  } catch (error) {
    return actionFromError(error, "setIssueStatus");
  }
}

/**
 * ⚠️ A REASON IS MANDATORY, enforced by the schema's `min(10)`.
 *
 * Ignoring is the one action whose effect outlives the person who took it: the
 * finding is suppressed on every future scan, and six months later someone
 * else has to understand why the site stopped reporting it. An unexplained
 * suppression is indistinguishable from a missed finding.
 */
export async function ignoreIssue(
  raw: z.infer<typeof issueSchemas.ignoreIssueSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("issue:ignore");

    const parsed = issueSchemas.ignoreIssueSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("issues.reasonRequired"), {
        reason: "IGNORE_ISSUE_SCHEMA",
      });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const ignored = await repos.issues.ignore(
      parsed.data.issueId,
      ctx.userId,
      parsed.data.reason,
    );
    if (!ignored) {
      throw new ValidationError(t("error.notFound"), {
        reason: `ISSUE_MISSING:${parsed.data.issueId}`,
      });
    }

    revalidatePath("/app/issues");
    revalidatePath(`/app/issues/${parsed.data.issueId}`);
    return actionOk({ id: ignored.id });
  } catch (error) {
    return actionFromError(error, "ignoreIssue");
  }
}
