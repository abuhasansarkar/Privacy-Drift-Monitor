/**
 * AI OUTPUT CONTRACTS — PLAN.md Part VIII §8.6, Phase 5 task 5.3.
 *
 * Every output has a Zod schema here. The schema is used THREE times per call
 * and that triplication is the point:
 *
 *   1. Converted to JSON Schema and sent to the provider as a strict
 *      structured-output specification, so the model cannot return a shape we
 *      reject (§8.3).
 *   2. Re-validated on receipt, because "strict" is the provider's promise and
 *      not ours — a proxy, a cached response or a different provider can all
 *      break it.
 *   3. Re-validated when a cached row is read back, because the row may have
 *      been written by an older prompt version.
 *
 * ⚠️ `evidence_refs` IS NOT AN ORDINARY FIELD. It is the mechanical enforcement
 * of P2 (AI never invents evidence). `.min(1)` means an output that cites
 * nothing is structurally impossible; `validate.ts` then proves every member
 * resolves to a real `IssueEvidence` id that was actually supplied in the
 * context. A schema-valid output with one bad ref is rejected whole.
 */

import { z } from "zod";

/** Shared across every output. `low` makes the UI show "review the evidence
 *  directly" instead of the confident rendering (§8.8, overconfidence). */
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type AIConfidence = z.infer<typeof confidenceSchema>;

/**
 * Cited evidence ids, capped at the 8 the context builder is allowed to send.
 *
 * Not `z.string().uuid()` on purpose: the id format is the database's business,
 * and a stricter shape here would reject a legitimate ref for the wrong reason.
 * Membership in the supplied context is the check that matters, and it is done
 * in `validate.ts` where the context is in scope.
 */
export const evidenceRefsSchema = z.array(z.string().min(1).max(64)).min(1).max(8);

/** §8.6 — `EXPLAIN_ISSUE`. Issue detail section 7. */
export const issueExplanationSchema = z.object({
  summary: z.string().min(20).max(400),
  technical_reason: z.string().min(20).max(800),
  likely_cause: z.string().min(10).max(500),
  confidence: confidenceSchema,
  evidence_refs: evidenceRefsSchema,
  recommended_action: z.string().min(10).max(500),
  /**
   * ⚠️ REQUIRED, NOT OPTIONAL. §8.8 lists "fact vs. hypothesis blur" as a named
   * risk; a boolean the model must set every time is what lets the UI render an
   * inference in a visually distinct, labeled block instead of as a finding.
   */
  is_hypothesis: z.boolean(),
});
export type IssueExplanation = z.infer<typeof issueExplanationSchema>;

/** §8.6 — `RECOMMEND_FIX`. Issue detail section 8. */
export const fixRecommendationSchema = z.object({
  steps: z
    .array(
      z.object({
        order: z.number().int().min(1),
        action: z.string().min(10).max(300),
        /** The actual screen or file to open: 'Google Tag Manager → Tags'. */
        where: z.string().max(200),
      }),
    )
    .min(1)
    .max(8),
  affected_system: z.enum([
    "cmp",
    "tag_manager",
    "theme",
    "plugin",
    "hardcoded",
    "third_party_embed",
    "unknown",
  ]),
  /** The risk of APPLYING the fix, not the risk of the issue (§8.7). */
  risk: z.enum(["low", "medium", "high"]),
  verification_steps: z.array(z.string().max(300)).min(1).max(5),
  confidence: confidenceSchema,
  evidence_refs: evidenceRefsSchema,
});
export type FixRecommendation = z.infer<typeof fixRecommendationSchema>;

/** §8.6 — the report intro paragraph. */
export const clientSummarySchema = z.object({
  summary: z.string().min(20).max(600),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  recommended_next_step: z.string().min(10).max(300),
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

/** §8.6 — `CLIENT_MESSAGE`. The output most likely to reach a third party. */
export const clientMessageSchema = z.object({
  subject: z.string().min(5).max(120),
  body: z.string().min(50).max(2500),
  tone: z.enum(["reassuring", "factual", "urgent"]),
  /**
   * ⚠️ `z.literal(true)` STRUCTURALLY FORCES THE DISCLAIMER. A model that
   * omitted the "direct legal questions to your own advisor" sentence and
   * honestly reported `false` fails the schema, so the draft never renders.
   * A boolean would have made the disclaimer advisory.
   */
  mentions_no_legal_advice: z.literal(true),
});
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** §8.6 — `SUMMARIZE_DRIFT`. Website Changes tab header, dashboard widget. */
export const driftSummarySchema = z.object({
  headline: z.string().min(10).max(160),
  narrative: z.string().min(30).max(1200),
  most_significant_change: z.string().max(300),
  /** Drift event ids. The grounding anchor for this feature. */
  events_referenced: z.array(z.string().min(1).max(64)).min(1).max(20),
  confidence: confidenceSchema,
});
export type DriftSummary = z.infer<typeof driftSummarySchema>;

/**
 * §8.6 — `CLASSIFY_TRACKER`, V1.5. Defined now because §8.5 requires the output
 * to route to `/admin/trackers` for human approval and never write to
 * `TrackerVendor` directly; `requires_human_review` being `z.literal(true)`
 * makes "approve automatically" un-expressible rather than merely discouraged.
 */
export const trackerClassificationSchema = z.object({
  proposed_vendor_name: z.string().max(120),
  proposed_category: z.string().max(64),
  proposed_risk: z.enum(["critical", "high", "medium", "low"]),
  reasoning: z.string().max(600),
  confidence: confidenceSchema,
  requires_human_review: z.literal(true),
});
export type TrackerClassification = z.infer<typeof trackerClassificationSchema>;

/**
 * Feature → schema. The single lookup used by the provider (to build the JSON
 * Schema), by the validator (to parse) and by the UI (to re-parse a stored
 * row), so the three can never disagree about what shape a feature returns.
 */
export const OUTPUT_SCHEMAS = {
  EXPLAIN_ISSUE: issueExplanationSchema,
  RECOMMEND_FIX: fixRecommendationSchema,
  SUMMARIZE_DRIFT: driftSummarySchema,
  CLIENT_MESSAGE: clientMessageSchema,
  CLASSIFY_TRACKER: trackerClassificationSchema,
} as const;

export type OutputSchemaFeature = keyof typeof OUTPUT_SCHEMAS;

/**
 * Which array on each output holds the grounding refs, and which id set it must
 * be checked against.
 *
 * ⚠️ A FEATURE MISSING FROM THIS TABLE IS UNGROUNDED. `validate.ts` treats an
 * absent entry as a hard failure rather than "nothing to check" — the failure
 * mode of a silently skipped grounding check is exactly the hallucination this
 * layer exists to prevent, so the default is closed.
 */
export const GROUNDING_FIELD = {
  EXPLAIN_ISSUE: "evidence_refs",
  RECOMMEND_FIX: "evidence_refs",
  SUMMARIZE_DRIFT: "events_referenced",
  /**
   * `null` = grounded by construction. A client message is generated FROM
   * issues that were themselves grounded, and cites no refs of its own; §8.5
   * gives it the strictest terminology validation instead.
   */
  CLIENT_MESSAGE: null,
  CLASSIFY_TRACKER: null,
} as const satisfies Record<OutputSchemaFeature, string | null>;
