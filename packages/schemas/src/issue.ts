import { z } from "zod";
import { issueStatus, severity } from "./enums";
import { reason as reasonText, uuid } from "./primitives";

/**
 * ISSUE QUERIES — §6.5.
 *
 * ⚠️ `IGNORED` is absent from the default status filter, not from the enum. An
 * ignored issue still exists; it is suppressed from the work queue because the
 * user said so, and a filter that could not express "show me ignored" would
 * make that decision irreversible in the UI.
 */
export const issueListQuerySchema = z.object({
  status: z.array(issueStatus).optional(),
  severity: z.array(severity).optional(),
  websiteId: uuid.optional(),
  clientId: uuid.optional(),
  search: z.string().trim().max(200).optional(),
  // Same shape as the website and client list queries, so pagination behaves
  // identically across every list in the app.
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

/** Ignoring requires a reason — see the repository note (§6.5). */
export const ignoreIssueSchema = z.object({
  issueId: uuid,
  reason: reasonText,
});

export const setIssueStatusSchema = z.object({
  issueId: uuid,
  status: z.enum(["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"]),
});

export type IgnoreIssueInput = z.infer<typeof ignoreIssueSchema>;
