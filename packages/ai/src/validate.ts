/**
 * VALIDATION PIPELINE — PLAN.md Part VIII §8.6, Phase 5 task 5.4.
 *
 * ⚠️ THIS FILE IS THE PRODUCT'S SAFETY BOUNDARY. Nothing reaches a user, a
 * client email or a PDF without passing every stage below. §12.7 names
 * "AI hallucination reaches a client" as a Low-probability/**High**-impact risk
 * and this pipeline is the control.
 *
 * The dev-doc's order of attack is deliberate and was followed: this file was
 * written BEFORE the real provider, against a `MockProvider` that emits
 * deliberately bad output — fabricated refs, banned terminology, unsupported
 * claims. "A validation pipeline written after the happy path is a validation
 * pipeline with holes."
 *
 * The five stages, in order (§8.6):
 *
 *   1. Schema parse       — Zod. Failure → ONE repair attempt, then fail.
 *   2. Grounding check    — every ref resolves, or the whole response dies.
 *   3. Terminology check  — the §1.12 forbidden list. Never repaired.
 *   4. Claim check        — no "I fixed it". Never repaired.
 *   5. Shape sanity       — schema-valid but degenerate output.
 *
 * ⚠️ ONLY STAGE 1 IS REPAIRABLE. §8.8: "a model that invented a reference or
 * asserted a legal conclusion is not to be coaxed; the call fails and the
 * deterministic content is shown." Repairing a grounding failure would teach
 * the model to guess again with the answer key in hand.
 *
 * ⚠️ EVERY FAILURE PATH ENDS IN THE SAME PLACE: the deterministic content the
 * page already had. A rejected AI response is not an error state — the rule's
 * `message`, `technicalReason` and `recommendedAction` were always sufficient
 * on their own (P3). That is what makes rejecting cheap enough to do strictly.
 */

import { findForbiddenTerms } from "@pdm/shared/copy/terminology";
import type { ZodType } from "zod";
import {
  GROUNDING_FIELD,
  OUTPUT_SCHEMAS,
  type OutputSchemaFeature,
} from "./schemas/index";
import type { AIErrorCode } from "./types";

export type ValidationStage =
  | "schema"
  | "grounding"
  | "terminology"
  | "claim"
  | "shape";

export interface ValidationFailure {
  stage: ValidationStage;
  errorCode: AIErrorCode;
  /** Human-readable, stored on `AIRequest.validationErrors` for the admin
   *  per-feature failure-rate chart (§8.6). */
  detail: string;
  /** Only a `schema` failure may be retried with the repair prompt (§8.8). */
  repairable: boolean;
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: ValidationFailure };

export interface ValidateOptions {
  /**
   * The ids the output is allowed to cite — built from the context that was
   * actually sent, via `groundingIdsOf()`.
   *
   * ⚠️ NOT "every id in the database". Grounding means "the model only talked
   * about what it was shown". An output citing a real `IssueEvidence` id that
   * was never in its context is still a fabrication — it guessed an id shape
   * and got lucky — and passing the full table would make that pass.
   */
  groundingIds: Set<string>;
}

/**
 * Phrases that assert an action was performed. §8.6 stage 4: "the AI never
 * acts, so it must never say it did."
 *
 * ⚠️ WHY THIS IS A SAFETY CHECK AND NOT PEDANTRY. Persona B forwards this text
 * to a client. "I've updated your tag manager" in an agency's outgoing email is
 * a false statement of work delivered, and the agency is the one who said it.
 *
 * Matched as whole phrases, case-insensitively. Kept SPECIFIC for the same
 * reason `FORBIDDEN_TERMS` is: a bare "fixed" would fire on the legitimate
 * "this can be fixed by…", and a validator that cries wolf gets loosened.
 */
const CLAIM_PATTERNS: readonly RegExp[] = [
  /\bi (?:have |'ve )?(?:already )?(?:fixed|resolved|updated|removed|disabled|corrected|applied)\b/i,
  /\bwe (?:have |'ve )?(?:already )?(?:fixed|resolved|updated|removed|disabled|corrected|applied) (?:this|it|the)\b/i,
  /\bthis (?:has been|was) (?:fixed|resolved|corrected|removed|addressed)\b/i,
  /\bthe (?:issue|problem) (?:has been|was) (?:fixed|resolved|corrected|removed)\b/i,
  /\bi (?:have )?(?:made|applied) the change\b/i,
  /\bno further action (?:is )?(?:required|needed)\b/i,
];

/** Every string leaf of an output, for the text-scanning stages. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

/**
 * STAGE 2 — GROUNDING. The mechanical enforcement of P2.
 *
 * ⚠️ A SINGLE UNRESOLVABLE REF REJECTS THE WHOLE RESPONSE (§8.6). Not the
 * offending ref — the response. Partial trust is not available here: if the
 * model invented one citation, the prose around it was written by the same
 * process, and dropping the ref while keeping the sentence it supported is
 * strictly worse than showing nothing, because the sentence then looks
 * grounded.
 */
function checkGrounding(
  feature: OutputSchemaFeature,
  data: unknown,
  groundingIds: Set<string>,
): ValidationFailure | null {
  const field = GROUNDING_FIELD[feature];

  // `null` = grounded by construction (a client message cites no refs of its
  // own). An ABSENT entry is a different thing entirely and fails closed below.
  if (field === null) return null;
  if (field === undefined) {
    return {
      stage: "grounding",
      errorCode: "GROUNDING_FAILED",
      detail:
        `No grounding field is declared for feature "${feature}". ` +
        `Add it to GROUNDING_FIELD — an undeclared feature is never trusted.`,
      repairable: false,
    };
  }

  const refs = (data as Record<string, unknown>)[field];
  if (!Array.isArray(refs)) {
    return {
      stage: "grounding",
      errorCode: "GROUNDING_FAILED",
      detail: `Expected "${field}" to be an array of ids.`,
      repairable: false,
    };
  }

  const unresolved = refs.filter(
    (ref) => typeof ref !== "string" || !groundingIds.has(ref),
  );
  if (unresolved.length > 0) {
    return {
      stage: "grounding",
      errorCode: "GROUNDING_FAILED",
      detail:
        `${unresolved.length} of ${refs.length} reference(s) in "${field}" ` +
        `do not resolve to evidence supplied in the context: ` +
        `${unresolved.map(String).join(", ")}`,
      repairable: false,
    };
  }

  return null;
}

/** STAGE 3 — TERMINOLOGY. §1.12's list, enforced on the way out (§8.6). */
function checkTerminology(data: unknown): ValidationFailure | null {
  for (const text of collectStrings(data)) {
    const found = findForbiddenTerms(text);
    if (found.length > 0) {
      return {
        stage: "terminology",
        errorCode: "TERMINOLOGY_REJECTED",
        detail: `Output asserted a legal conclusion: ${found.join(", ")}`,
        repairable: false,
      };
    }
  }
  return null;
}

/** STAGE 4 — CLAIM CHECK. §8.6: the AI never acts, so it must never say it did. */
function checkClaims(data: unknown): ValidationFailure | null {
  for (const text of collectStrings(data)) {
    for (const pattern of CLAIM_PATTERNS) {
      if (pattern.test(text)) {
        return {
          stage: "claim",
          errorCode: "CLAIM_REJECTED",
          detail: `Output claimed an action had been performed: ${pattern.source}`,
          repairable: false,
        };
      }
    }
  }
  return null;
}

/**
 * STAGE 5 — SHAPE SANITY. §8.6: "re-checked because a provider may return a
 * schema-valid but degenerate response (e.g. repeated text)."
 *
 * A model that loops produces `min(20).max(400)`-satisfying prose made of one
 * sentence forty times. The schema cannot see that; a reader immediately can,
 * and it destroys trust in every other output on the page.
 */
function checkShape(data: unknown): ValidationFailure | null {
  for (const text of collectStrings(data)) {
    if (text.length < 40) continue;

    // A long string whose distinct words number under a fifth of its total
    // is a loop, not prose.
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length >= 20) {
      const distinct = new Set(words).size;
      if (distinct / words.length < 0.2) {
        return {
          stage: "shape",
          errorCode: "VALIDATION_FAILED",
          detail: `Degenerate output: ${distinct} distinct words in ${words.length}.`,
          repairable: false,
        };
      }
    }

    // The same non-trivial sentence three times over is the other loop shape.
    const sentences = text
      .split(/[.!?]+\s+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 15);
    if (sentences.length >= 3 && new Set(sentences).size === 1) {
      return {
        stage: "shape",
        errorCode: "VALIDATION_FAILED",
        detail: "Degenerate output: one sentence repeated.",
        repairable: false,
      };
    }
  }
  return null;
}

/**
 * Runs the full pipeline against one raw provider response.
 *
 * The caller retries ONCE with the repair prompt when `failure.repairable` is
 * true, and never otherwise — see `run.ts`.
 */
export function validateAIOutput<F extends OutputSchemaFeature>(
  feature: F,
  raw: unknown,
  options: ValidateOptions,
): ValidationResult<unknown> {
  const schema = OUTPUT_SCHEMAS[feature] as ZodType | undefined;
  if (!schema) {
    return {
      ok: false,
      failure: {
        stage: "schema",
        errorCode: "VALIDATION_FAILED",
        detail: `No output schema registered for feature "${feature}".`,
        repairable: false,
      },
    };
  }

  // ── Stage 1: schema ─────────────────────────────────────────────────────
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        stage: "schema",
        errorCode: "VALIDATION_FAILED",
        detail: summariseZodError(parsed.error),
        // ⚠️ The ONLY repairable stage.
        repairable: true,
      },
    };
  }
  const data = parsed.data;

  // ── Stages 2–5: none repairable ─────────────────────────────────────────
  const failure =
    checkGrounding(feature, data, options.groundingIds) ??
    checkTerminology(data) ??
    checkClaims(data) ??
    checkShape(data);

  return failure ? { ok: false, failure } : { ok: true, data };
}

/**
 * A compact error string for the repair prompt and for
 * `AIRequest.validationErrors`.
 *
 * Capped, because the repair prompt is sent back to the provider: an unbounded
 * Zod error on a large object is both a token cost and a way for context text
 * to make a second trip through the prompt.
 */
export function summariseZodError(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")
    .slice(0, 600);
}

/** Exported for the unit tests, which assert each stage independently. */
export const __validators = {
  checkGrounding,
  checkTerminology,
  checkClaims,
  checkShape,
  collectStrings,
  CLAIM_PATTERNS,
};
