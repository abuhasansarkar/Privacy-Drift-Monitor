import type {
  DigestFrequency,
  NotificationType,
  Severity,
} from "@prisma/client";
import type { TenantClient } from "../tenant";
import { cursorSlice, type CursorPageRequest } from "./types";

/**
 * ALERT RULES & HISTORY — PLAN.md Part VI §6.6, Part III §3.11.
 *
 * ⚠️ `AlertHistory` IS NOT TELEMETRY. §3.11 requires the History tab to show
 * "type, trigger, channel, recipients, sent time, delivery status" — an agency
 * asking "did our client's contact actually receive Tuesday's alert?" is
 * answered from these rows and from the Resend webhooks that update them.
 *
 * ⚠️ It is also the DEDUPLICATION STORE. `lastSentAt` below is what the
 * four-hour duplicate window is measured against, which is why the write
 * happens on dispatch and not on delivery confirmation — a bounced email still
 * counts as an alert we tried to send.
 */

export interface AlertRuleInput {
  name: string;
  enabled: boolean;
  scopeType: string;
  scopeId: string | null;
  triggerTypes: NotificationType[];
  minSeverity: Severity;
  channels: string[];
  digest: DigestFrequency;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  criticalOverridesQuietHours: boolean;
  recipients: string[];
}

export interface AlertHistoryInput {
  alertRuleId: string | null;
  type: NotificationType;
  channel: string;
  recipients: string[];
  entityType: string | null;
  entityId: string | null;
  status: string;
  providerId?: string | null;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
}

export function alertRepository(db: TenantClient, agencyId: string) {
  return {
    async listRules() {
      return db.alertRule.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] });
    },

    /** Enabled rules only — the dispatcher never needs the rest. */
    async activeRules() {
      return db.alertRule.findMany({ where: { enabled: true } });
    },

    async findRule(id: string) {
      return db.alertRule.findUnique({ where: { id } });
    },

    async createRule(input: AlertRuleInput) {
      return db.alertRule.create({ data: { ...input, agencyId } });
    },

    async updateRule(id: string, input: Partial<AlertRuleInput>) {
      // `updateMany` rather than `update`: a rule id from another tenant must
      // come back as "not found" (count 0), never as a P2025 the caller has to
      // translate — and never as a mutation (§6.2).
      const result = await db.alertRule.updateMany({ where: { id }, data: input });
      return result.count === 1 ? db.alertRule.findUnique({ where: { id } }) : null;
    },

    async deleteRule(id: string): Promise<boolean> {
      const result = await db.alertRule.deleteMany({ where: { id } });
      return result.count === 1;
    },

    /**
     * Seeds the default rule set for a new agency.
     *
     * ⚠️ AN AGENCY WITH NO RULES RECEIVES NOTHING — `planDispatch` returns
     * `no_matching_rule`. That is correct behaviour for a rule engine and
     * catastrophic onboarding, so a default rule is created with the agency.
     */
    async ensureDefaultRule(params: {
      triggerTypes: NotificationType[];
      name: string;
    }) {
      const existing = await db.alertRule.count();
      if (existing > 0) return null;
      return db.alertRule.create({
        data: {
          agencyId,
          name: params.name,
          enabled: true,
          scopeType: "ALL",
          scopeId: null,
          triggerTypes: params.triggerTypes,
          minSeverity: "MEDIUM",
          channels: ["email", "in_app"],
          digest: "IMMEDIATE",
          quietHoursStart: null,
          quietHoursEnd: null,
          criticalOverridesQuietHours: true,
          recipients: [],
        },
      });
    },

    // ── History ────────────────────────────────────────────────────────────

    async recordHistory(input: AlertHistoryInput) {
      return db.alertHistory.create({
        data: {
          agencyId,
          alertRuleId: input.alertRuleId,
          type: input.type,
          channel: input.channel,
          recipients: input.recipients,
          entityType: input.entityType,
          entityId: input.entityId,
          status: input.status,
          providerId: input.providerId ?? null,
          errorMessage: input.errorMessage ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    },

    /**
     * The last time this (agency, type, entity) alerted — the duplicate window.
     *
     * ⚠️ `suppressed_*` rows are EXCLUDED. Counting a suppression as a send
     * would let one alert at 09:00 suppress every re-fire until 13:00 and then
     * suppress again off the suppression record, indefinitely.
     */
    async lastSentAt(params: {
      type: NotificationType;
      entityId: string | null;
      since: Date;
    }): Promise<Date | null> {
      const row = await db.alertHistory.findFirst({
        where: {
          type: params.type,
          entityId: params.entityId,
          createdAt: { gte: params.since },
          status: { notIn: ["suppressed_duplicate", "suppressed_quiet_hours"] },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    },

    async listHistory(
      params: CursorPageRequest & { type?: NotificationType; status?: string },
    ) {
      const rows = await db.alertHistory.findMany({
        where: {
          ...(params.type ? { type: params.type } : {}),
          ...(params.status ? { status: params.status } : {}),
        },
        include: { alertRule: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      });
      return cursorSlice(rows, params.limit);
    },

    /** Idempotency guard (§9.5) — checked before an alert is queued. */
    async hasBeenSent(idempotencyKey: string): Promise<boolean> {
      const row = await db.alertHistory.findFirst({
        where: { idempotencyKey },
        select: { id: true },
      });
      return row !== null;
    },

    /**
     * Has this exact send already reached the provider?
     *
     * ⚠️ MATCHED ON THE KEY PREFIX, because one send writes two rows: the
     * `queued` row claims the bare key, and the outcome row appends
     * `:sent` / `:failed` (the key is UNIQUE, so they cannot share it). A
     * retried job must see the OUTCOME row, and an equality check on the bare
     * key would only ever find the `queued` one — which is present on every
     * attempt and would therefore suppress the first real send.
     */
    async hasBeenDelivered(idempotencyKey: string): Promise<boolean> {
      const row = await db.alertHistory.findFirst({
        where: {
          idempotencyKey: { startsWith: `${idempotencyKey}:` },
          status: { in: ["sent", "delivered", "opened", "simulated"] },
        },
        select: { id: true },
      });
      return row !== null;
    },

    /** Used by the Resend webhook handler. Returns false when nothing matched. */
    async recordDeliveryStatus(params: {
      providerId: string;
      status: string;
      at: Date;
      errorMessage?: string | null;
    }): Promise<boolean> {
      const result = await db.alertHistory.updateMany({
        where: { providerId: params.providerId },
        data: {
          status: params.status,
          ...(params.status === "delivered" ? { deliveredAt: params.at } : {}),
          ...(params.status === "opened" ? { openedAt: params.at } : {}),
          ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
        },
      });
      return result.count > 0;
    },

    /** Agency id, restated so callers do not have to thread it separately. */
    agencyId,
  };
}

export type AlertRepository = ReturnType<typeof alertRepository>;
