"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { website as websiteSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ConflictError, ValidationError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";
import { requirePermission, requireWebsiteAccess } from "@/server/auth/context";
import { requireAllowedValue } from "@/server/services/entitlement-guard";
import { triggerScan } from "@/server/services/scan-service";
import { validateWebsiteUrl } from "@/server/services/website-validation";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * WEBSITE ACTIONS — §3.6, §5.6, Phase 1 tasks 1.6/1.8/1.11.
 *
 * ⚠️ EVERY ACTION RE-CHECKS AUTHORIZATION ITSELF. Next 16's proxy does not
 * reliably cover Server Actions, because an action POSTs to the route that
 * invoked it — `src/proxy.ts` is a first line of defence, never the only one
 * (§6.1). `requirePermission()` is the first statement in each function here,
 * and that is not a convention we can relax.
 *
 * ⚠️ NO SCAN IS ENQUEUED FROM INSIDE A TRANSACTION (§5.6): "if the transaction
 * rolls back, the job still exists and will operate on data that was never
 * committed". The repository commits and returns the row; enqueueing happens
 * after, and lands in Phase 2 when a queue exists.
 */

const createInput = websiteSchemas.createWebsiteSchema;

export async function createWebsite(
  input: z.infer<typeof createInput>,
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const ctx = await requirePermission("website:create");

    const parsed = createInput.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: `CREATE_WEBSITE_SCHEMA:${parsed.error.issues[0]?.path.join(".")}`,
      });
    }

    /*
     * Re-run the FULL validation chain, including the SSRF guard. The wizard
     * has already called `/api/websites/validate` and holds a normalized URL,
     * and trusting it here is exactly the hole that would make the guard
     * decorative: an action is a public POST endpoint, so anything reaching it
     * is caller-supplied no matter what the UI did first.
     */
    const outcome = await validateWebsiteUrl(ctx, parsed.data.url);
    if (!outcome.ok) {
      const { code, message } = outcome.result;
      const error =
        code === "DUPLICATE"
          ? new ConflictError(message ?? t("urlError.duplicate"), {
              reason: `DUPLICATE_WEBSITE:${parsed.data.url}`,
            })
          : new ValidationError(message ?? t("urlError.invalid"), {
              reason: `URL_REJECTED:${code}`,
            });
      throw error;
    }

    const { normalized } = outcome;
    const repos = repositoriesFor(ctx.agencyId);

    /*
     * ⚠️ ENFORCEMENT POINT (§9.2): "Select daily frequency →
     * `scanFrequencies.includes('DAILY')` → Option disabled with a plan
     * tooltip".
     *
     * The UI disables the option, so reaching this guard means a stale form or
     * a crafted request. It refuses rather than silently substituting WEEKLY:
     * a customer who asked for daily monitoring and quietly got weekly would
     * believe they were covered every day, and the gap only surfaces as a
     * finding nobody was told about for six days.
     *
     * ⚠️ Daily starts at Growth (§9.3) precisely because it is a 7× cost
     * multiplier and the single most compelling upgrade trigger — so this guard
     * is a revenue surface, not just a limit.
     */
    await requireAllowedValue(
      ctx.agencyId,
      "scanFrequencies",
      parsed.data.scanFrequency,
    );

    const created = await repos.websites.create(
      {
        url: normalized.url,
        // The address the user actually typed, kept alongside the canonical
        // form so support can answer "but I entered…" (§3.6).
        originalUrl: parsed.data.url,
        host: normalized.host,
        registrableDomain: normalized.registrableDomain,
        clientId: parsed.data.clientId ?? null,
        groupId: parsed.data.groupId ?? null,
        label: parsed.data.label ?? null,
        // These four carry schema defaults, so they are always present after a
        // successful parse — no `??` fallback that could disagree with the
        // schema's own default.
        scanFrequency: parsed.data.scanFrequency,
        scanPriority: parsed.data.scanPriority,
        monitoredPaths: parsed.data.monitoredPaths,
        alertProfile: parsed.data.alertProfile,
        // null = inherit the agency's `respectRobots` setting.
        respectRobots: parsed.data.respectRobots ?? null,
        // MANUAL means "do not schedule" (§7.5). Everything else is due now, so
        // the baseline scan is picked up by the first scheduler pass.
        nextScanAt: parsed.data.scanFrequency === "MANUAL" ? null : new Date(),
      },
      { userId: ctx.userId },
    );

    /*
     * The baseline scan, enqueued AFTER the write above and never inside it.
     *
     * ⚠️ THIS TODO OUTLIVED ITS REASON. It read "there is no queue until Phase
     * 2, so `nextScanAt` is the only signal for now" — but the queue shipped
     * long ago, and the comment kept the behaviour frozen. The effect was that
     * adding a website did nothing visible for up to a full scheduler tick
     * (60s by default): the user pressed Add, landed on a site reading "Never
     * scanned", and had no way to tell whether anything had been set in motion.
     *
     * ⚠️ A FAILURE HERE MUST NOT FAIL THE CREATE. The website exists and is
     * committed; `triggerScan` can legitimately refuse (a scan quota reached,
     * Redis briefly down), and none of those are reasons to tell the user their
     * website was not added. `nextScanAt` is still set, so the scheduler picks
     * up anything this misses — the enqueue is an accelerator, not the
     * mechanism.
     */
    if (parsed.data.scanFrequency !== "MANUAL") {
      try {
        await triggerScan({
          agencyId: ctx.agencyId,
          websiteId: created.id,
          userId: ctx.userId,
          // `ONBOARDING`, not `SCHEDULED` — the enum distinguishes a site's
          // first scan from a recurring one, and admin scan lists read it.
          trigger: "ONBOARDING",
        });
      } catch (error) {
        childLogger({ agencyId: ctx.agencyId, websiteId: created.id }).warn(
          { err: error },
          "baseline scan not enqueued; the scheduler will pick it up",
        );
      }
    }

    revalidatePath("/app/websites");
    revalidatePath("/app");

    return actionOk({ id: created.id, url: created.url });
  } catch (error) {
    return actionFromError(error, "createWebsite");
  }
}

const monitoringInput = z.object({
  websiteId: z.uuid(),
  action: z.enum(["pause", "resume"]),
});

export async function setWebsiteMonitoring(
  input: z.infer<typeof monitoringInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = monitoringInput.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: "SET_MONITORING_SCHEMA",
      });
    }

    // Website-scoped members may only touch their own sites, and a site outside
    // scope raises NOT_FOUND rather than FORBIDDEN — a 403 would confirm the id
    // exists somewhere the caller cannot see (§6.2).
    const ctx = await requireWebsiteAccess(parsed.data.websiteId, "website:update");
    const repos = repositoriesFor(ctx.agencyId);

    const pausing = parsed.data.action === "pause";
    const updated = await repos.websites.setMonitoring(
      parsed.data.websiteId,
      pausing ? "PAUSED" : "ACTIVE",
      // `nextScanAt` is the SINGLE source of truth for scheduling (§7.5), so
      // pausing nulls it rather than setting a flag the scheduler might not read.
      pausing ? null : new Date(),
      { userId: ctx.userId },
    );

    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `WEBSITE_MISSING:${parsed.data.websiteId}`,
      });
    }

    revalidatePath("/app/websites");
    return actionOk({ id: updated.id });
  } catch (error) {
    return actionFromError(error, "setWebsiteMonitoring");
  }
}

const archiveInput = z.object({ websiteId: z.uuid() });

/**
 * Archive, **not delete** — scan history and reports stay retrievable, and
 * archiving is reversible where deleting monitoring history is not (§3.6).
 */
export async function archiveWebsite(
  input: z.infer<typeof archiveInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = archiveInput.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "ARCHIVE_SCHEMA" });
    }

    const ctx = await requireWebsiteAccess(parsed.data.websiteId, "website:delete");
    const repos = repositoriesFor(ctx.agencyId);

    const archived = await repos.websites.archive(parsed.data.websiteId, {
      userId: ctx.userId,
    });
    if (!archived) {
      throw new ValidationError(t("error.notFound"), {
        reason: `WEBSITE_MISSING:${parsed.data.websiteId}`,
      });
    }

    revalidatePath("/app/websites");
    revalidatePath("/app");
    return actionOk({ id: archived.id });
  } catch (error) {
    return actionFromError(error, "archiveWebsite");
  }
}
