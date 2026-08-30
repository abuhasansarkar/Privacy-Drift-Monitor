import { describe, expect, it } from "vitest";
import {
  APPROVED_TERMS,
  DISCLAIMER_SHORT,
  assertApprovedTerminology,
  findForbiddenTerms,
} from "../copy/terminology";

/**
 * TERMINOLOGY GUARD — PLAN.md Part I §1.12.
 *
 * This is the runtime half of the control. The CI half is
 * `scripts/check-terminology.ts`, which greps the tree. Both exist because AI
 * output is generated at runtime and cannot be caught by a build-time grep
 * (§8.7).
 */

describe("findForbiddenTerms", () => {
  it("catches the compliance-authority language the product must never use", () => {
    expect(findForbiddenTerms("This is a GDPR violation")).toContain("violation");
    expect(findForbiddenTerms("Your site is non-compliant")).toContain("non-compliant");
    expect(findForbiddenTerms("You must fix this immediately")).toContain("you must");
    expect(findForbiddenTerms("This tracking is illegal")).toContain("illegal");
  });

  it("catches it regardless of case", () => {
    expect(findForbiddenTerms("VIOLATION detected").length).toBeGreaterThan(0);
    expect(findForbiddenTerms("Illegal Tracking").length).toBeGreaterThan(0);
  });

  it("passes the approved alternatives", () => {
    // This is the invariant that keeps the two halves of the control coherent:
    // an "approved" phrase that its own checker rejects is a trap. It caught
    // the qualified-finding entry, which contained a banned word.
    for (const phrase of Object.values(APPROVED_TERMS)) {
      expect(findForbiddenTerms(phrase), `"${phrase}" should be allowed`).toEqual([]);
    }
  });

  it("still rejects the qualified phrase §1.12 allows in prose", () => {
    // §1.12 permits "potential consent violation" with a qualifier, but neither
    // the grep nor this matcher can express "only with a qualifier", so the
    // narrower rule wins and the phrase is not exported as approved.
    expect(findForbiddenTerms("potential consent violation")).toContain(
      "violation",
    );
    expect(Object.values(APPROVED_TERMS)).not.toContain(
      "potential consent violation",
    );
  });

  it("passes the real UI strings from the page specs", () => {
    const strings = [
      "A Meta Pixel request was observed before any consent was given.",
      "3 marketing trackers fired",
      "Could not be determined — preferences link not found",
      "No potential privacy issues detected in the latest scan.",
      "Review recommended",
      "This may require review by your privacy advisor",
      "Some consent tests couldn't be completed on this scan.",
    ];
    for (const s of strings) {
      expect(findForbiddenTerms(s), `leaked in: ${s}`).toEqual([]);
    }
  });

  it("does not fire on substrings inside unrelated words", () => {
    // "compliant" must not match inside "compliantly-named-variable" style text,
    // and ordinary prose containing "must" is fine — only "you must" is banned.
    expect(findForbiddenTerms("The scan must complete before analysis")).toEqual([]);
  });

  it("keeps the disclaimer itself clean", () => {
    // The disclaimer is embedded in every PDF and shown at onboarding. If our
    // own boundary statement trips the check, the check is wrong.
    expect(findForbiddenTerms(DISCLAIMER_SHORT)).toEqual([]);
  });
});

describe("assertApprovedTerminology", () => {
  it("throws with the offending term and a pointer to the spec", () => {
    expect(() => assertApprovedTerminology("a clear violation", "test")).toThrow(
      /violation/,
    );
    expect(() => assertApprovedTerminology("a clear violation", "test")).toThrow(
      /§1\.12/,
    );
  });

  it("is silent on approved copy", () => {
    expect(() =>
      assertApprovedTerminology("Tracker detected before consent", "test"),
    ).not.toThrow();
  });
});
