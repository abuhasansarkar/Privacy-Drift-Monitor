import { z } from "zod";
import { reportStatus, reportType } from "./enums";
import { uuid } from "./primitives";

/**
 * REPORT INPUTS — §6.8, §3.11.
 *
 * ⚠️ SCOPE IS VALIDATED AGAINST THE TYPE. A `WEBSITE_HEALTH` report with no
 * website, or a `SCAN` report with no scan, would reach the worker and fail
 * there — after the row exists, after the queue slot is taken, and after the
 * user has been told it is generating.
 */

export const reportOptionsSchema = z.object({
  includeEvidenceAppendix: z.boolean().default(false),
  includeAiSummary: z.boolean().default(false),
  includeResolvedIssues: z.boolean().default(false),
  includeScreenshots: z.boolean().default(true),
});

export const generateReportSchema = z
  .object({
    type: reportType,
    name: z.string().trim().min(1).max(120),
    clientId: uuid.nullable().default(null),
    websiteId: uuid.nullable().default(null),
    scanId: uuid.nullable().default(null),
    periodStart: z.coerce.date().nullable().default(null),
    periodEnd: z.coerce.date().nullable().default(null),
    options: reportOptionsSchema.default({
      includeEvidenceAppendix: false,
      includeAiSummary: false,
      includeResolvedIssues: false,
      includeScreenshots: true,
    }),
  })
  .refine((input) => input.type !== "SCAN" || input.scanId !== null, {
    message: "Choose the scan to report on",
    path: ["scanId"],
  })
  .refine(
    (input) => input.type !== "WEBSITE_HEALTH" || input.websiteId !== null,
    { message: "Choose the website to report on", path: ["websiteId"] },
  )
  .refine(
    (input) =>
      input.type !== "MONTHLY_MONITORING" ||
      (input.periodStart !== null && input.periodEnd !== null),
    { message: "Choose the period this report covers", path: ["periodEnd"] },
  )
  .refine(
    (input) =>
      input.periodStart === null ||
      input.periodEnd === null ||
      input.periodStart <= input.periodEnd,
    { message: "The start date must be before the end date", path: ["periodEnd"] },
  );

export const reportListQuerySchema = z.object({
  type: reportType.optional(),
  status: reportStatus.optional(),
  clientId: uuid.optional(),
  websiteId: uuid.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const reportIdSchema = z.object({ reportId: uuid });

/** §3.11 — time-limited, signed, audit-logged. The ceiling is a week. */
export const createReportShareSchema = z.object({
  reportId: uuid,
  expiresInDays: z.coerce.number().int().min(1).max(7).default(7),
});

export const revokeReportShareSchema = z.object({ reportId: uuid, shareId: uuid });

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
export type ReportOptionsInput = z.infer<typeof reportOptionsSchema>;
