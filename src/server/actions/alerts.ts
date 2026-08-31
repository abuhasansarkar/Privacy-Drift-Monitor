"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { notification as notificationSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * ALERT RULE ACTIONS — §6.6, §6.2.
 *
 * ⚠️ `alert:manage` IS MANAGER+ (§6.2). An alert rule decides what the whole
 * agency hears about; a Viewer disabling "critical findings, all sites" would
 * silence monitoring for everyone, silently, and the symptom would be nothing
 * happening.
 *
 * ⚠️ EVERY CHANGE IS AUDIT-LOGGED. "Why did we stop getting alerts about this
 * client in March?" is answerable only if the rule edit left a trail.
 */

function toRuleData(input: notificationSchemas.AlertRuleInput) {
  return {
    name: input.name,
    enabled: input.enabled,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    triggerTypes: input.triggerTypes,
    minSeverity: input.minSeverity,
    channels: input.channels,
    digest: input.digest,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    criticalOverridesQuietHours: input.criticalOverridesQuietHours,
    recipients: input.recipients,
  };
}

export async function createAlertRule(
  raw: z.infer<typeof notificationSchemas.createAlertRuleSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("alert:manage");

    const parsed = notificationSchemas.createAlertRuleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "ALERT_RULE_SCHEMA" },
      );
    }

    const repos = repositoriesFor(ctx.agencyId);
    const rule = await repos.alerts.createRule(toRuleData(parsed.data));

    await repos.audit.record({
      action: "agency.updated",
      entityType: "alert_rule",
      entityId: rule.id,
      userId: ctx.userId,
      after: { name: rule.name, triggerTypes: rule.triggerTypes },
    });

    revalidatePath("/app/alerts");
    return actionOk({ id: rule.id });
  } catch (error) {
    return actionFromError(error, "createAlertRule");
  }
}

export async function updateAlertRule(
  raw: z.infer<typeof notificationSchemas.updateAlertRuleSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("alert:manage");

    const parsed = notificationSchemas.updateAlertRuleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "ALERT_RULE_SCHEMA" },
      );
    }

    const repos = repositoriesFor(ctx.agencyId);
    const before = await repos.alerts.findRule(parsed.data.id);
    const updated = await repos.alerts.updateRule(
      parsed.data.id,
      toRuleData(parsed.data.rule),
    );

    // Null means "no row matched under this tenant" — surfaced as not-found,
    // never as forbidden, so an id from another agency cannot be confirmed
    // to exist (§6.2).
    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `ALERT_RULE_MISSING:${parsed.data.id}`,
      });
    }

    await repos.audit.record({
      action: "agency.updated",
      entityType: "alert_rule",
      entityId: updated.id,
      userId: ctx.userId,
      before: before ? { enabled: before.enabled, minSeverity: before.minSeverity } : null,
      after: { enabled: updated.enabled, minSeverity: updated.minSeverity },
    });

    revalidatePath("/app/alerts");
    return actionOk({ id: updated.id });
  } catch (error) {
    return actionFromError(error, "updateAlertRule");
  }
}

export async function toggleAlertRule(
  raw: z.infer<typeof notificationSchemas.toggleAlertRuleSchema>,
): Promise<ActionResult<{ id: string; enabled: boolean }>> {
  try {
    const ctx = await requirePermission("alert:manage");

    const parsed = notificationSchemas.toggleAlertRuleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "ALERT_TOGGLE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const updated = await repos.alerts.updateRule(parsed.data.id, {
      enabled: parsed.data.enabled,
    });
    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `ALERT_RULE_MISSING:${parsed.data.id}`,
      });
    }

    // ⚠️ Audited even though it is one boolean. Disabling a rule is the change
    // whose effect is invisible — nothing happens — so it is the one most
    // worth being able to trace.
    await repos.audit.record({
      action: "agency.updated",
      entityType: "alert_rule",
      entityId: updated.id,
      userId: ctx.userId,
      after: { enabled: updated.enabled },
    });

    revalidatePath("/app/alerts");
    return actionOk({ id: updated.id, enabled: updated.enabled });
  } catch (error) {
    return actionFromError(error, "toggleAlertRule");
  }
}

export async function deleteAlertRule(
  raw: z.infer<typeof notificationSchemas.deleteAlertRuleSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("alert:manage");

    const parsed = notificationSchemas.deleteAlertRuleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "ALERT_DELETE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const deleted = await repos.alerts.deleteRule(parsed.data.id);
    if (!deleted) {
      throw new ValidationError(t("error.notFound"), {
        reason: `ALERT_RULE_MISSING:${parsed.data.id}`,
      });
    }

    await repos.audit.record({
      action: "agency.updated",
      entityType: "alert_rule",
      entityId: parsed.data.id,
      userId: ctx.userId,
      after: { deleted: true },
    });

    revalidatePath("/app/alerts");
    return actionOk({ id: parsed.data.id });
  } catch (error) {
    return actionFromError(error, "deleteAlertRule");
  }
}
