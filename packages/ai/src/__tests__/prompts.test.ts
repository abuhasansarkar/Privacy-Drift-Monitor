/**
 * PROMPT INTEGRITY — PLAN.md Part VIII §8.7, Phase 5 task 5.3.
 *
 * ⚠️ THE FIRST TEST HERE EXISTS BECAUSE THE DEFECT ALREADY HAPPENED ONCE
 * DURING THIS PHASE. An attempt to satisfy `scripts/check-terminology.ts` with
 * per-line `// terminology-allow` markers put those comments INSIDE the
 * preamble's template literal — so the model would have received three stray
 * comment lines in the middle of its absolute constraints, and every generated
 * output would have been shaped by an instruction set nobody wrote. Nothing
 * would have failed: not the typecheck, not the schema, not the validators.
 * The file is now skipped by path instead, and this test is the guard that
 * makes a repeat visible.
 */

import { describe, expect, it } from "vitest";
import { FORBIDDEN_TERMS } from "@pdm/shared/copy/terminology";
import {
  PROMPTS,
  REPAIR_SUFFIX,
  SYSTEM_PREAMBLE_V1,
  renderPrompt,
} from "../prompts/index";
import { MAX_OUTPUT_TOKENS } from "../config";
import { OUTPUT_SCHEMAS, GROUNDING_FIELD } from "../schemas/index";

describe("no source-comment syntax leaks into a prompt", () => {
  const templates = [
    ["system", SYSTEM_PREAMBLE_V1],
    ["repair", REPAIR_SUFFIX],
    ...Object.entries(PROMPTS).map(([key, prompt]) => [key, prompt.user] as const),
  ] as const;

  for (const [name, text] of templates) {
    it(`${name} carries no // comment or terminology marker`, () => {
      expect(text).not.toContain("terminology-allow");
      expect(text).not.toMatch(/(^|\s)\/\/\s/);
      expect(text).not.toContain("/*");
    });
  }
});

describe("the system preamble — §8.7", () => {
  it("embeds the SAME forbidden list the validator enforces", () => {
    // §8.7 requires the list in the prompt; if it drifted from
    // `FORBIDDEN_TERMS`, the prompt would permit what the validator rejects and
    // we would pay for responses that are thrown away.
    for (const term of FORBIDDEN_TERMS) {
      expect(SYSTEM_PREAMBLE_V1).toContain(`"${term}"`);
    }
  });

  it("states all seven absolute constraints", () => {
    for (let i = 1; i <= 7; i++) {
      expect(SYSTEM_PREAMBLE_V1).toContain(`\n${i}. `);
    }
  });

  it("requires JSON-only output", () => {
    expect(SYSTEM_PREAMBLE_V1).toContain("Respond only with JSON");
  });
});

describe("every prompt is versioned and complete", () => {
  for (const [feature, prompt] of Object.entries(PROMPTS)) {
    it(`${feature} has a version, a schema, a grounding entry and a token cap`, () => {
      // The version is hashed into `inputHash`; without it a prompt edit
      // silently keeps serving the old prompt's cached output.
      expect(prompt.version).toMatch(/_V\d+$/);
      expect(prompt.version.startsWith(feature)).toBe(true);
      expect(OUTPUT_SCHEMAS).toHaveProperty(feature);
      expect(Object.hasOwn(GROUNDING_FIELD, feature)).toBe(true);
      expect(MAX_OUTPUT_TOKENS).toHaveProperty(feature);
    });
  }
});

describe("renderPrompt", () => {
  it("throws rather than shipping an unresolved placeholder", () => {
    // A prompt that silently sends "{{cms}}" to the model produces output that
    // looks fine and was reasoned from a literal brace.
    expect(() => renderPrompt(PROMPTS.RECOMMEND_FIX.user, { contextJson: "{}" })).toThrow(
      /Unresolved prompt placeholder/,
    );
  });

  it("resolves every placeholder when all are supplied", () => {
    const rendered = renderPrompt(PROMPTS.RECOMMEND_FIX.user, {
      contextJson: "{}",
      cms: "WordPress",
      cmp: "Complianz",
    });
    expect(rendered).toContain("WordPress");
    expect(rendered).not.toContain("{{");
  });

  it("does not interpret $& in a value as a replacement pattern", () => {
    // ⚠️ A LIVE INJECTION PATH: context strings originate from scanned sites,
    // and `String.replace` treats `$&` in the REPLACEMENT as "the whole match".
    // A cookie named `$&$&$&` would otherwise splice `{{contextJson}}` back into
    // the prompt repeatedly.
    const rendered = renderPrompt("A {{value}} B", { value: "$& $` $' $1" });
    expect(rendered).toBe("A $& $` $' $1 B");
  });
});
