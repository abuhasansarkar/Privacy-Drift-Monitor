import { z } from "zod";
import { digestFrequency, notificationType, severity } from "./enums";
import { cursor, email, uuid } from "./primitives";

/**
 * NOTIFICATION & ALERT INPUTS — §6.6, §3.11.
 *
 * ⚠️ Quiet hours are `"HH:mm"` STRINGS in the AGENCY's timezone, not instants.
 * Storing an instant would freeze the window against DST, which is the exact
 * bug `@pdm/notifications/quiet-hours` exists to avoid.
 */

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use a 24-hour time, e.g. 22:00");

export const notificationListQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  type: notificationType.optional(),
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const markNotificationsReadSchema = z.object({
  // Empty means "mark all" — expressed as an explicit flag rather than as an
  // empty array, because an accidental empty array from a filtered UI would
  // otherwise silently clear the whole centre.
  ids: z.array(uuid).max(200).default([]),
  all: z.boolean().default(false),
});

export const alertScopeType = z.enum(["ALL", "GROUP", "CLIENT", "WEBSITE"]);
export const alertChannel = z.enum(["in_app", "email"]);

export const alertRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    enabled: z.boolean().default(true),
    scopeType: alertScopeType.default("ALL"),
    scopeId: uuid.nullable().default(null),
    triggerTypes: z.array(notificationType).min(1, "Choose at least one alert type"),
    minSeverity: severity.default("HIGH"),
    channels: z.array(alertChannel).min(1, "Choose at least one channel"),
    digest: digestFrequency.default("IMMEDIATE"),
    quietHoursStart: hhmm.nullable().default(null),
    quietHoursEnd: hhmm.nullable().default(null),
    criticalOverridesQuietHours: z.boolean().default(true),
    recipients: z.array(email).max(20).default([]),
  })
  .refine(
    (rule) => rule.scopeType === "ALL" || rule.scopeId !== null,
    { message: "Choose what this rule applies to", path: ["scopeId"] },
  )
  .refine(
    // Both or neither. One bound alone is a window with no end, and the
    // dispatcher would treat it as "off" — silently, which is worse than a
    // validation message.
    (rule) =>
      (rule.quietHoursStart === null) === (rule.quietHoursEnd === null),
    { message: "Set both a start and an end time", path: ["quietHoursEnd"] },
  )
  .refine(
    (rule) => rule.quietHoursStart !== rule.quietHoursEnd || rule.quietHoursStart === null,
    { message: "Quiet hours must cover a period of time", path: ["quietHoursEnd"] },
  );

export const createAlertRuleSchema = alertRuleSchema;
export const updateAlertRuleSchema = z.object({
  id: uuid,
  rule: alertRuleSchema,
});
export const toggleAlertRuleSchema = z.object({ id: uuid, enabled: z.boolean() });
export const deleteAlertRuleSchema = z.object({ id: uuid });

export const alertHistoryQuerySchema = z.object({
  type: notificationType.optional(),
  status: z.string().trim().max(40).optional(),
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const notificationPreferenceSchema = z.object({
  type: notificationType,
  inApp: z.boolean(),
  email: z.boolean(),
  digest: digestFrequency,
});

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema).max(40),
});

export type AlertRuleInput = z.infer<typeof alertRuleSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
