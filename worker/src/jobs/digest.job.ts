import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { renderMessage, type DigestGroupPayload } from "@pdm/email";
import {
  digestTotals,
  digestWindow,
  groupDigest,
  type DigestItem,
} from "@pdm/notifications";
import { resolveBranding } from "@pdm/reports/branding";
import { enqueueEmail, type DigestJobData, type EmailJobData } from "@pdm/scanner/queue/queues";
import { SEVERITY_LABEL } from "@pdm/shared/copy/labels";
import { childLogger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";

/**
 * DIGEST JOB — PLAN.md Part VI §6.6, Phase 4 task 4.2.
 *
 * ⚠️ ONE JOB PER TIMEZONE, FANNING OUT TO THE AGENCIES IN IT. Feature doc 13:
 * "A per-agency repeatable job does not scale to thousands of agencies. Group
 * by timezone." BullMQ scans its repeatable set on every tick, so 10,000
 * repeatables degrade the whole queue — including the scan queue that shares
 * the Redis instance.
 *
 * ⚠️ IT READS THE NOTIFICATION ROWS, NOT A SEPARATE PENDING TABLE. The digest
 * is a summary of what happened, and a second store of the same facts is a
 * second thing that can disagree with the notification centre.
 */

const globalDb = unsafeGlobalClient(
  // Justification (required in review): the digest sweeps every agency in one
  // timezone. Per-agency reads below all go through `repositoriesFor`.
  "digest fans out across every agency sharing a timezone",
);

/** A digest email carries the worst 40 items and counts the rest. */
const MAX_ITEMS = 40;

export interface DigestDeps {
  emailQueue: Queue<EmailJobData>;
  now?: () => Date;
}

export async function runDigest(
  data: DigestJobData,
  deps: DigestDeps,
): Promise<{ agencies: number; emails: number }> {
  const now = deps.now?.() ?? new Date();
  const log = childLogger({ component: "digest" });
  const { from, to } = digestWindow(now, data.frequency);

  const agencies = await globalDb.agency.findMany({
    where: { timezone: data.timeZone, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true },
  });

  let emails = 0;

  for (const agency of agencies) {
    try {
      emails += await digestForAgency({
        agencyId: agency.id,
        frequency: data.frequency,
        timeZone: data.timeZone,
        from,
        to,
        deps,
      });
    } catch (error) {
      // ⚠️ ONE AGENCY'S FAILURE DOES NOT ABORT THE ZONE. A throw here would
      // deny every later agency in the same timezone their digest, and the
      // retry would re-send to everyone who already received one.
      log.error({ err: error, agencyId: agency.id }, "digest failed for agency");
    }
  }

  log.info(
    { timeZone: data.timeZone, frequency: data.frequency, agencies: agencies.length, emails },
    "digest run finished",
  );
  return { agencies: agencies.length, emails };
}

async function digestForAgency(params: {
  agencyId: string;
  frequency: "DAILY" | "WEEKLY";
  timeZone: string;
  from: Date;
  to: Date;
  deps: DigestDeps;
}): Promise<number> {
  const repos = repositoriesFor(params.agencyId);
  const wanted = params.frequency;

  // Only members who chose this cadence for at least one type. A member on
  // IMMEDIATE already had their email; including them here would double-send.
  const members = await repos.db.notificationPreference.findMany({
    where: { digest: wanted, email: true },
    select: { userId: true, type: true },
  });
  if (members.length === 0) return 0;

  const byUser = new Map<string, string[]>();
  for (const row of members) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row.type);
    byUser.set(row.userId, list);
  }

  const users = await repos.db.agencyMember.findMany({
    where: { userId: { in: [...byUser.keys()] }, status: "ACTIVE" },
    select: { userId: true, user: { select: { email: true, emailUndeliverableAt: true } } },
  });

  const websiteLabels = await websiteLabelMap(repos);
  let sent = 0;

  for (const member of users) {
    // A hard-bounced address is skipped rather than retried into the same
    // bounce every morning (§9.5).
    if (member.user.emailUndeliverableAt) continue;

    const types = byUser.get(member.userId) ?? [];
    const rows = await repos.notifications.listForDigest({
      userIds: [member.userId],
      from: params.from,
      to: params.to,
      types: types as never[],
    });

    // ⚠️ NO EMAIL WHEN NOTHING HAPPENED. A daily "nothing to report" is the
    // fastest way to teach someone to filter us out.
    if (rows.length === 0) continue;

    const items: DigestItem[] = rows.map((row) => ({
      type: row.type,
      severity: row.severity,
      title: row.title,
      body: row.body,
      linkUrl: row.linkUrl,
      websiteId: row.entityType === "website" ? row.entityId : null,
      websiteLabel:
        (row.entityType === "website" && row.entityId
          ? websiteLabels.get(row.entityId)
          : null) ?? "Your portfolio",
      createdAt: row.createdAt,
    }));

    const groups = groupDigest(items);
    const totals = digestTotals(groups);

    const { payload, omitted } = capGroups(groups, MAX_ITEMS);

    const branding = await resolveBranding(params.agencyId, { whiteLabelEnabled: false });
    const idempotencyKey = `digest:${params.agencyId}:${member.userId}:${wanted}:${params.to
      .toISOString()
      .slice(0, 10)}`;

    // Re-running a digest for the same day cannot send twice: the key is the
    // BullMQ job id and the AlertHistory unique index.
    if (await repos.alerts.hasBeenSent(idempotencyKey)) continue;

    const message =
      wanted === "DAILY"
        ? ({
            template: "daily-digest" as const,
            data: {
              groups: payload,
              total: totals.total,
              omitted,
              dateLabel: formatDay(params.from, params.timeZone),
            },
          })
        : ({
            template: "weekly-summary" as const,
            data: {
              groups: payload,
              total: totals.total,
              omitted,
              websitesMonitored: websiteLabels.size,
              averageScore: await averageScore(repos),
              periodLabel: `${formatDay(params.from, params.timeZone)} – ${formatDay(
                params.to,
                params.timeZone,
              )}`,
            },
          });

    // Rendered here only to fail loudly on a bad payload before it is queued.
    renderMessage(message, branding, { appUrl: "", portalUrl: "" });

    await enqueueEmail(params.deps.emailQueue, {
      agencyId: params.agencyId,
      message: message as unknown,
      to: member.user.email,
      userId: member.userId,
      alertRuleId: null,
      notificationType: null,
      entityType: "digest",
      entityId: null,
      idempotencyKey,
    });

    await repos.alerts.recordHistory({
      alertRuleId: null,
      type: "PRIVACY_DRIFT",
      channel: "email",
      recipients: [member.user.email],
      entityType: "digest",
      entityId: null,
      status: "queued",
      idempotencyKey,
    });

    sent += 1;
  }

  return sent;
}

/**
 * Caps a digest at `max` items, keeping the worst.
 *
 * `groupDigest` has already sorted groups and items worst-first, so taking
 * from the front keeps the critical findings and drops the informational tail.
 */
function capGroups(
  groups: ReturnType<typeof groupDigest>,
  max: number,
): { payload: DigestGroupPayload[]; omitted: number } {
  const payload: DigestGroupPayload[] = [];
  let budget = max;
  let omitted = 0;

  for (const group of groups) {
    if (budget <= 0) {
      omitted += group.items.length;
      continue;
    }
    const take = group.items.slice(0, budget);
    omitted += group.items.length - take.length;
    budget -= take.length;
    payload.push({
      websiteLabel: group.websiteLabel,
      topSeverity: group.topSeverity,
      items: take.map((item) => ({
        severity: item.severity,
        severityLabel: SEVERITY_LABEL[item.severity],
        title: item.title,
        linkUrl: item.linkUrl,
      })),
    });
  }

  return { payload, omitted };
}

async function websiteLabelMap(
  repos: ReturnType<typeof repositoriesFor>,
): Promise<Map<string, string>> {
  const rows = await repos.db.website.findMany({
    where: { archivedAt: null },
    select: { id: true, url: true },
  });
  return new Map(rows.map((row) => [row.id, row.url]));
}

/**
 * ⚠️ PARTIAL SCANS ARE EXCLUDED, NOT COUNTED AS ZERO (P5). A partial scan has
 * no score, and averaging it in as 0 would report a portfolio-wide collapse
 * caused by one site's consent banner failing to open.
 */
async function averageScore(
  repos: ReturnType<typeof repositoriesFor>,
): Promise<number | null> {
  const result = await repos.db.website.aggregate({
    where: { archivedAt: null, healthScore: { not: null } },
    _avg: { healthScore: true },
  });
  const value = result._avg?.healthScore ?? null;
  return value === null ? null : Math.round(value);
}

function formatDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }).format(value);
}
