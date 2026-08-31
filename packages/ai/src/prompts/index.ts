/**
 * PROMPTS — PLAN.md Part VIII §8.7, Phase 5 task 5.3.
 *
 * ⚠️ VERSIONED, AND THE VERSION IS RECORDED ON EVERY `AIRequest`. §8.7: "so an
 * output can always be traced to the prompt that produced it." That trace is
 * also what makes the admin surface useful — §8.6 reports a per-feature
 * validation-failure rate and §8.8 a per-prompt-version acceptance rate, and
 * neither means anything if "the prompt" is a moving target.
 *
 * ⚠️ THE VERSION IS ALSO PART OF THE CACHE KEY (§8.9,
 * `inputHash = sha256(feature + promptVersion + canonicalJson(context))`).
 * EDITING A PROMPT WITHOUT BUMPING ITS VERSION SERVES STALE OUTPUT FROM THE OLD
 * ONE — the change appears to do nothing, and the reason is invisible. Bump the
 * version in the same edit, always.
 */

import { FORBIDDEN_TERMS } from "@pdm/shared/copy/terminology";
import type { AIFeature } from "../types";

/**
 * The forbidden list is INTERPOLATED FROM `@pdm/shared`, not retyped.
 *
 * Two reasons, and the second is the one that bites. First, §8.7 requires the
 * same list the validator enforces to appear in the prompt — a prompt that
 * permits what the validator rejects just burns tokens on responses that will
 * be thrown away. Second, retyping the words here would put them in a source
 * file that `scripts/check-terminology.ts` scans, so the CI gate would fail on
 * the very file whose job is to prevent that language. Interpolation satisfies
 * both without a `terminology-allow` escape hatch.
 */
const FORBIDDEN_LIST = FORBIDDEN_TERMS.map((term) => `"${term}"`).join(", ");

/**
 * SHARED SYSTEM PREAMBLE — §8.7, applied to every call.
 *
 * The seven constraints are the prompt-side half of §8.8's control table; the
 * other half is `validate.ts`. Neither is sufficient alone: a prompt is a
 * request and a validator is a guarantee, but a validator with no prompt
 * behind it rejects most of what it is sent.
 */
/*
 * ⚠️ THIS FILE IS SKIPPED BY PATH IN `scripts/check-terminology.ts`, and that
 * exemption is deliberate rather than a convenience.
 *
 * The §1.12 gate bans prescriptive and legal-conclusion language because it is
 * aimed at a CUSTOMER — that vocabulary is what turns a monitoring service into
 * a compliance authority. The preamble below aims the same vocabulary at the
 * MODEL, in the constraints that FORBID it. A prohibition cannot be written
 * without naming the thing prohibited, which is exactly why
 * `copy/terminology.ts` and the checker itself are already skipped the same
 * way; this is the third file in that category, not a new kind of exception.
 *
 * ⚠️ A PER-LINE `terminology-allow` MARKER WOULD NOT WORK HERE AND MUST NOT BE
 * ATTEMPTED. The text is one template literal, so a trailing `//` comment on a
 * constraint line is not a comment at all — it is prompt content, silently
 * shipped to the model in the middle of its instructions. The path skip is the
 * only mechanism that does not corrupt the artifact it is protecting.
 *
 * ⚠️ THE PREAMBLE IS §8.7 VERBATIM. Someone diffing it against the plan must
 * find it identical — a prompt that has quietly drifted from its specification
 * is how model behaviour changes with nobody able to say when. Rewording to
 * dodge a grep would trade a real property for a clean report.
 */
export const SYSTEM_PREAMBLE_V1 = `You are a technical assistant inside a privacy and consent monitoring platform used by web
development agencies. You explain findings that were produced by a deterministic browser
scanner and a rule engine.

ABSOLUTE CONSTRAINTS:
1. Every factual statement you make must be supported by an item in the EVIDENCE array.
   Cite the evidence by its \`ref\` value in \`evidence_refs\`. Never cite a ref that is not
   in the provided EVIDENCE array.
2. You must NOT invent requests, cookies, domains, timings, vendors, or any technical
   detail that is not in the provided context.
3. You must NOT state or imply legal conclusions. Never use any of these words or
   phrases: ${FORBIDDEN_LIST}. Use instead: "potential issue", "detected",
   "observed", "review recommended", "may require review".
4. You must NOT claim that any action has been taken, fixed, or completed. You only
   describe and recommend.
5. When you are inferring rather than reporting, say so and set \`is_hypothesis\` to true.
6. If the evidence is insufficient to answer confidently, say so and set confidence to "low".
   An honest "the evidence does not show why" is a correct answer.
7. Write for a competent web professional who is not a privacy specialist. Be concrete
   and brief. No preamble, no restating the question.

Respond only with JSON matching the provided schema.`;

export const EXPLAIN_ISSUE_V1 = `Explain this potential privacy issue.

CONTEXT:
{{contextJson}}

Produce:
- summary: 1–2 sentences a non-technical account manager can understand. Say what was
  observed and why it is being flagged.
- technical_reason: what the scanner observed and why the rule considers it notable.
  Reference the consent phase and the timing.
- likely_cause: the most probable technical origin given the CMS and CMP in the context.
  If the evidence does not indicate a cause, say so and set is_hypothesis true.
- recommended_action: the single most useful next step.
- confidence: high only when the evidence directly supports your explanation.
- evidence_refs: the refs you actually relied on.`;

export const RECOMMEND_FIX_V1 = `Recommend how to address this potential issue.

CONTEXT:
{{contextJson}}

Rules:
- Steps must be specific to the CMS ({{cms}}) and CMP ({{cmp}}) named in the context.
  If either is unknown, give steps that work generally and say which detail would
  narrow it down.
- \`where\` should name the actual screen or file a developer would open.
- verification_steps must describe how to confirm the fix using this platform
  (re-scan and check the relevant consent phase) plus one independent check.
- Do not suggest disabling the consent banner or suppressing detection.
- risk describes the risk of applying the fix (e.g. breaking analytics continuity),
  not the risk of the issue.`;

export const CLIENT_MESSAGE_V1 = `Draft a message from a web agency to their client about the findings below.

CONTEXT:
{{contextJson}}
TONE: {{tone}}
FIX_IN_PROGRESS: {{fixInProgress}}

Rules:
- The reader is a non-technical marketing contact.
- Explain what was found, what it means practically, and what happens next.
- Do not alarm. Do not minimise. Do not promise a compliance outcome.
- Include one sentence noting that this is a technical observation and that legal
  questions should be directed to their own advisor. Set mentions_no_legal_advice true.
- Do not include pricing, internal notes, or scanner implementation details.
- 150–250 words.`;

export const SUMMARIZE_DRIFT_V1 = `Summarise what changed on this website between two scans.

CONTEXT:
{{contextJson}}

- headline: one line, under 160 characters, naming the most important change.
- narrative: 2–4 sentences. Group related changes. State whether the overall direction
  is an improvement or a degradation, based only on the events provided.
- most_significant_change: name the single event that most warrants attention and why.
- events_referenced: the event ids you actually used.
- If all changes are minor, say so plainly rather than manufacturing significance.`;

/**
 * ⚠️ ONLY APPENDED ON A SCHEMA FAILURE (§8.8). A grounding or terminology
 * failure is NOT repaired: "a model that invented a reference or asserted a
 * legal conclusion is not to be coaxed" — the call fails and the deterministic
 * content is shown, which was always sufficient on its own.
 */
export const REPAIR_SUFFIX = `

Your previous response failed validation: {{zodError}}
Return corrected JSON matching the schema exactly. Do not add commentary.`;

export interface PromptTemplate {
  /** Recorded on `AIRequest.promptVersion` and hashed into `inputHash`. */
  version: string;
  system: string;
  user: string;
  /** Name sent to the provider with the strict JSON schema. */
  schemaName: string;
}

export const PROMPTS = {
  EXPLAIN_ISSUE: {
    version: "EXPLAIN_ISSUE_V1",
    system: SYSTEM_PREAMBLE_V1,
    user: EXPLAIN_ISSUE_V1,
    schemaName: "issue_explanation",
  },
  RECOMMEND_FIX: {
    version: "RECOMMEND_FIX_V1",
    system: SYSTEM_PREAMBLE_V1,
    user: RECOMMEND_FIX_V1,
    schemaName: "fix_recommendation",
  },
  SUMMARIZE_DRIFT: {
    version: "SUMMARIZE_DRIFT_V1",
    system: SYSTEM_PREAMBLE_V1,
    user: SUMMARIZE_DRIFT_V1,
    schemaName: "drift_summary",
  },
  CLIENT_MESSAGE: {
    version: "CLIENT_MESSAGE_V1",
    system: SYSTEM_PREAMBLE_V1,
    user: CLIENT_MESSAGE_V1,
    schemaName: "client_message",
  },
} as const satisfies Partial<Record<AIFeature, PromptTemplate>>;

export type PromptFeature = keyof typeof PROMPTS;

/**
 * Fills `{{placeholders}}`.
 *
 * ⚠️ AN UNRESOLVED PLACEHOLDER THROWS rather than rendering `{{cms}}` to the
 * model. A prompt that silently ships its own template syntax produces output
 * that looks fine and was reasoned from a literal brace — the kind of defect
 * that is only ever found by reading a transcript.
 *
 * Values are substituted with a function replacer so a `$&` or `$1` inside a
 * context string cannot be interpreted as a replacement pattern — that is a
 * live injection path, since context strings originate from scanned sites.
 */
export function renderPrompt(
  template: string,
  values: Record<string, string>,
): string {
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });

  const unresolved = rendered.match(/\{\{(\w+)\}\}/g);
  if (unresolved) {
    throw new Error(
      `Unresolved prompt placeholder(s): ${unresolved.join(", ")}. ` +
        `Every {{name}} must be supplied by the caller.`,
    );
  }
  return rendered;
}
