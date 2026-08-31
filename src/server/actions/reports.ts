"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { enqueueReport } from "@pdm/scanner/queue/queues";
import { report as reportSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ConflictError, NotFoundError, ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { releaseMetric } from "@/server/entitlements";
import {
  requireAllowedValue,
  requireAndConsume,
} from "@/server/services/entitlement-guard";
import { reportQueue } from "@/server/services/queues";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * REPORT ACTIONS — §6.8, §3.11.
 *
 * ⚠️ THE ROW IS CREATED BEFORE THE JOB IS PUBLISHED, never the reverse — the
 * same rule as `triggerScan` (§5.6). A job referencing a report id that does
 * not exist is a worker crash on a race the user cannot see; a QUEUED row with
 * no job is visible and re-runnable.
 *
 * ⚠️ A FAILED REPORT DOES NOT CONSUME THE ALLOWANCE (§12.3). Nothing here
 * decrements anything: usage is recorded by the worker on `markReady`, at the
 * one point a document is known to exist.
 */

/** §3.11 — share links are time-limited, signed and audit-logged. */
const SHARE_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateReport(
  raw: z.infer<typeof reportSchemas.generateReportSchema>,
): Promise<ActionResult<{ reportId: string }>> {
  try {
    const ctx = await requirePermission("report:generate");

    const parsed = reportSchemas.generateReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "GENERATE_REPORT_SCHEMA" },
      );
    }
    const input = parsed.data;

    const repos = repositoriesFor(ctx.agencyId);

    /*
     * ⚠️ THE SCOPE IDS ARE RE-VERIFIED AGAINST THE TENANT before the row is
     * written. Zod proved the shape; only this proves the client and website
     * belong to the caller's agency — and a report is the artefact most likely
     * to be forwarded outside it.
     */
    if (input.clientId) {
      const client = await repos.db.client.findUnique({
        where: { id: input.clientId },
        select: { id: true },
      });
      if (!client) {
        throw new NotFoundError(t("error.notFound"), {
          reason: `CLIENT_NOT_IN_TENANT:${input.clientId}`,
        });
      }
    }
    if (input.websiteId) {
      const website = await repos.db.website.findUnique({
        where: { id: input.websiteId },
        select: { id: true },
      });
      if (!website) {
        throw new NotFoundError(t("error.notFound"), {
          reason: `WEBSITE_NOT_IN_TENANT:${input.websiteId}`,
        });
      }
    }
    if (input.scanId) {
      const scan = await repos.db.scan.findUnique({
        where: { id: input.scanId },
        select: { id: true },
      });
      if (!scan) {
        throw new NotFoundError(t("error.notFound"), {
          reason: `SCAN_NOT_IN_TENANT:${input.scanId}`,
        });
      }
    }

    /*
     * Idempotency: a double-submitted wizard must not produce two identical
     * PDFs and two Chromium renders. The key is the REQUEST, not a random
     * value, so the second submit finds the first report.
     */
    const idempotencyKey = [
      ctx.agencyId,
      input.type,
      input.clientId ?? "-",
      input.websiteId ?? "-",
      input.scanId ?? "-",
      input.periodStart?.toISOString() ?? "-",
      input.periodEnd?.toISOString() ?? "-",
      // Bucketed to the minute: "generate the same report again tomorrow" is a
      // legitimate request, "the button fired twice" is not.
      new Date().toISOString().slice(0, 16),
    ].join("|");

    const existing = await repos.reports.findByIdempotencyKey(idempotencyKey);
    if (existing) return actionOk({ reportId: existing.id });

    /*
     * ⚠️ ENFORCEMENT POINT (§9.2): "Generate report →
     * `checkLimit(REPORTS)` + `reportTypes.includes(type)` → 402 / type
     * unavailable". Two separate checks, because they fail for different
     * reasons and a reader needs to know which: "you have used all 50 reports"
     * invites an upgrade for MORE, "Privacy Drift reports are not on Starter"
     * invites an upgrade for a DIFFERENT THING.
     *
     * ⚠️ AFTER THE IDEMPOTENCY LOOKUP. A double-clicked button returns the
     * first report without touching the allowance — charging twice for one
     * report because the user's connection was slow is exactly the billing
     * dispute this phase exists to avoid.
     */
    await requireAllowedValue(ctx.agencyId, "reportTypes", input.type);
    await requireAndConsume(ctx.agencyId, "REPORTS", 1);

    let report;
    try {
      report = await repos.reports.create({
        type: input.type,
        name: input.name,
        clientId: input.clientId,
        websiteId: input.websiteId,
        createdById: ctx.userId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        // `scanId` rides in options — see the note in `report.job.ts`.
        options: { ...input.options, scanId: input.scanId } as never,
        idempotencyKey,
      });
    } catch (error) {
      // ⚠️ §12.3: "a failed report must not consume the allowance."
      await releaseMetric(ctx.agencyId, "REPORTS", 1).catch(() => {});
      throw error;
    }

    await repos.audit.record({
      action: "report.generated",
      entityType: "report",
      entityId: report.id,
      userId: ctx.userId,
      after: { type: report.type, name: report.name },
    });

    try {
      await enqueueReport(reportQueue(), {
        agencyId: ctx.agencyId,
        reportId: report.id,
        requestedByUserId: ctx.userId,
      });
    } catch (error) {
      // The row stays QUEUED and is re-runnable from the detail page, which is
      // strictly better than telling the user nothing happened.
      await repos.reports.markFailed(
        report.id,
        "QUEUE_UNAVAILABLE",
        error instanceof Error ? error.message.slice(0, 200) : "Queue unavailable",
      );
      throw error;
    }

    revalidatePath("/app/reports");
    return actionOk({ reportId: report.id });
  } catch (error) {
    return actionFromError(error, "generateReport");
  }
}

export async function regenerateReport(
  raw: z.infer<typeof reportSchemas.reportIdSchema>,
): Promise<ActionResult<{ reportId: string }>> {
  try {
    const ctx = await requirePermission("report:generate");

    const parsed = reportSchemas.reportIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REPORT_ID_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const requeued = await repos.reports.requeue(parsed.data.reportId);
    if (!requeued) {
      // Either it is not ours, or it is already generating. Both answer the
      // same way — a 404-shaped result never confirms an id from another
      // tenant (§6.2).
      throw new ConflictError(t("error.notFound"), {
        reason: `REPORT_NOT_REQUEUEABLE:${parsed.data.reportId}`,
      });
    }

    await enqueueReport(reportQueue(), {
      agencyId: ctx.agencyId,
      reportId: parsed.data.reportId,
      requestedByUserId: ctx.userId,
    });

    revalidatePath("/app/reports");
    revalidatePath(`/app/reports/${parsed.data.reportId}`);
    return actionOk({ reportId: parsed.data.reportId });
  } catch (error) {
    return actionFromError(error, "regenerateReport");
  }
}

/**
 * Creates a share link.
 *
 * ⚠️ THE RAW TOKEN IS RETURNED ONCE AND ONLY THE HASH IS STORED. A share link
 * is a bearer credential for a client-facing document; a database read must
 * never hand someone a working URL, and the UI says "copy it now".
 */
export async function createReportShare(
  raw: z.infer<typeof reportSchemas.createReportShareSchema>,
): Promise<ActionResult<{ token: string; expiresAt: Date }>> {
  try {
    const ctx = await requirePermission("report:share");

    const parsed = reportSchemas.createReportShareSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REPORT_SHARE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const report = await repos.reports.findById(parsed.data.reportId);
    if (!report) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `REPORT_MISSING:${parsed.data.reportId}`,
      });
    }
    if (report.status !== "READY") {
      throw new ConflictError(t("reports.previewUnavailable"), {
        reason: `REPORT_NOT_READY:${report.status}`,
      });
    }

    const token = randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
    );

    await repos.reports.createShare({
      reportId: report.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdById: ctx.userId,
    });

    // §3.11 requires share links to be audit-logged: the trail is how an agency
    // answers "who sent this client our report".
    await repos.audit.record({
      action: "report.shared",
      entityType: "report",
      entityId: report.id,
      userId: ctx.userId,
      after: { expiresAt: expiresAt.toISOString() },
    });

    revalidatePath(`/app/reports/${report.id}`);
    return actionOk({ token, expiresAt });
  } catch (error) {
    return actionFromError(error, "createReportShare");
  }
}

export async function revokeReportShare(
  raw: z.infer<typeof reportSchemas.revokeReportShareSchema>,
): Promise<ActionResult<{ shareId: string }>> {
  try {
    const ctx = await requirePermission("report:share");

    const parsed = reportSchemas.revokeReportShareSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REPORT_SHARE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const revoked = await repos.reports.revokeShare(parsed.data.shareId, new Date());
    if (!revoked) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `SHARE_MISSING:${parsed.data.shareId}`,
      });
    }

    await repos.audit.record({
      action: "report.shared",
      entityType: "report_share",
      entityId: parsed.data.shareId,
      userId: ctx.userId,
      after: { revoked: true },
    });

    revalidatePath(`/app/reports/${parsed.data.reportId}`);
    return actionOk({ shareId: parsed.data.shareId });
  } catch (error) {
    return actionFromError(error, "revokeReportShare");
  }
}

export async function deleteReport(
  raw: z.infer<typeof reportSchemas.reportIdSchema>,
): Promise<ActionResult<{ reportId: string }>> {
  try {
    const ctx = await requirePermission("report:delete");

    const parsed = reportSchemas.reportIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REPORT_ID_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    // ⚠️ SOFT DELETE. The S3 object is collected by the retention sweep, not
    // here: deleting the object inline would make an in-flight download 404
    // mid-stream, and a report someone is reading is worth more than the
    // storage.
    const deleted = await repos.reports.softDelete(parsed.data.reportId, new Date());
    if (!deleted) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `REPORT_MISSING:${parsed.data.reportId}`,
      });
    }

    await repos.audit.record({
      action: "report.deleted",
      entityType: "report",
      entityId: parsed.data.reportId,
      userId: ctx.userId,
    });

    revalidatePath("/app/reports");
    return actionOk({ reportId: parsed.data.reportId });
  } catch (error) {
    return actionFromError(error, "deleteReport");
  }
}
