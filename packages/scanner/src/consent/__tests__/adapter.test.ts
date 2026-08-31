import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import {
  actionFailure,
  actionSuccess,
  clickAndVerify,
  resolveAdapter,
  type ConsentAdapter,
} from "../adapter";
import type { CmpDetectionResult } from "../../types";

/**
 * CONSENT ADAPTER FRAMEWORK — PLAN.md Part IV §4.6, Phase 2 task 2.6.
 *
 * ⚠️ THIS IS THE PART OF THE SCANNER THAT DECIDES WHAT "CONSENT" MEANT. Every
 * finding downstream is qualified by a consent phase, and a phase is only
 * meaningful if the click that produced it actually happened and was correctly
 * described. A cascade bug does not throw — it silently downgrades a
 * high-confidence known-CMP match to a generic guess, or records a click that
 * did not land, and every issue derived from that phase inherits the error.
 *
 * The file was at 45% coverage with the cascade itself untested.
 *
 * `Page` is faked rather than mocked wholesale: only `locator()` is used here,
 * so a small hand-built double is clearer than a Playwright harness and keeps
 * `packages/scanner` testable with no browser (feature doc 05).
 */

function fakeDetection(overrides: Partial<CmpDetectionResult> = {}): CmpDetectionResult {
  return {
    cmpId: "cookiebot",
    cmpName: "Cookiebot",
    version: null,
    confidence: 0.95,
    matchedVia: "adapter_selector",
    ...overrides,
  } as CmpDetectionResult;
}

/** An adapter whose `detect` behaviour the test controls. */
function fakeAdapter(
  id: string,
  detect: () => Promise<CmpDetectionResult | null>,
): ConsentAdapter {
  return {
    id,
    name: id,
    detect,
    perform: async () => actionFailure("CONSENT_BUTTON_NOT_FOUND", "not implemented"),
  } as unknown as ConsentAdapter;
}

const PAGE = {} as Page;

describe("resolveAdapter — the resolution cascade (§4.6)", () => {
  it("returns the FIRST adapter that detects, not the best-scoring one", async () => {
    /*
     * ⚠️ ORDER IS THE CONTRACT, not a tie-break on confidence. §4.6 puts
     * specific CMP adapters before the generic heuristic precisely so a known
     * platform wins; a "highest confidence" rule would look equivalent and
     * would let a confident generic guess beat a certain adapter match.
     */
    const first = fakeAdapter("cookiebot", async () => fakeDetection({ confidence: 0.8 }));
    const second = fakeAdapter("generic", async () =>
      fakeDetection({ cmpId: "generic", confidence: 0.99 }),
    );

    const resolved = await resolveAdapter(PAGE, [first, second]);
    expect(resolved?.adapter.id).toBe("cookiebot");
  });

  it("skips adapters that do not detect", async () => {
    const resolved = await resolveAdapter(PAGE, [
      fakeAdapter("a", async () => null),
      fakeAdapter("b", async () => null),
      fakeAdapter("c", async () => fakeDetection({ cmpId: "c" })),
    ]);
    expect(resolved?.adapter.id).toBe("c");
  });

  it("A THROWING ADAPTER DOES NOT STOP THE CASCADE", async () => {
    /*
     * ⚠️ THE ONE THAT MATTERS MOST. A single adapter throwing — a selector
     * change on one vendor's banner, a detached frame — must not take the whole
     * consent journey down. Without the `.catch()` in `resolveAdapter`, one
     * broken vendor adapter would make every site fall through to a failed
     * phase, and the product would report "could not be determined" across the
     * board for a reason nobody could see.
     */
    const exploding = fakeAdapter("broken", async () => {
      throw new Error("selector detached");
    });
    const working = fakeAdapter("generic", async () => fakeDetection({ cmpId: "generic" }));

    const resolved = await resolveAdapter(PAGE, [exploding, working]);
    expect(resolved?.adapter.id).toBe("generic");
  });

  it("returns null when nothing detects — a site with no CMP", async () => {
    // Not an error. Plenty of sites have no consent platform at all, and that
    // is itself a finding the rule engine makes (§4.11), not a scanner failure.
    expect(await resolveAdapter(PAGE, [fakeAdapter("a", async () => null)])).toBeNull();
  });

  it("returns null for an empty adapter list", async () => {
    expect(await resolveAdapter(PAGE, [])).toBeNull();
  });

  it("stops calling adapters once one detects", async () => {
    // Detection must be cheap AND must not run further than needed: every
    // `detect` touches the page, and §4.6 requires detection be side-effect
    // free precisely because it runs before the behaviour we are recording.
    const later = vi.fn(async () => fakeDetection());
    await resolveAdapter(PAGE, [
      fakeAdapter("first", async () => fakeDetection()),
      fakeAdapter("second", later),
    ]);
    expect(later).not.toHaveBeenCalled();
  });
});

describe("actionFailure / actionSuccess", () => {
  it("a failure never claims an action was performed", () => {
    const result = actionFailure("CONSENT_BUTTON_NOT_FOUND", "no button");
    expect(result.performed).toBe(false);
    expect(result.method).toBeNull();
    // ⚠️ `bannerDismissed: null` means UNKNOWN, not "still showing". A failed
    // click tells us nothing about the banner, and recording `false` would be
    // the scanner asserting something it did not observe (P6).
    expect(result.bannerDismissed).toBeNull();
    expect(result.errorCode).toBe("CONSENT_BUTTON_NOT_FOUND");
  });

  it("a success carries no error and defaults inIframe to false", () => {
    const result = actionSuccess({
      method: "adapter_selector",
      confidence: 0.95,
      selectorUsed: "#accept",
      elementText: "Accept all",
      bannerDismissed: true,
    });
    expect(result.performed).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.inIframe).toBe(false);
  });

  it("preserves an explicit inIframe", () => {
    // Usercentrics renders in an iframe; losing this flag would make a
    // correctly-handled iframe banner indistinguishable from a top-level one
    // in the evidence.
    const result = actionSuccess({
      method: "adapter_selector",
      confidence: 0.9,
      selectorUsed: "#a",
      elementText: null,
      inIframe: true,
      bannerDismissed: null,
    });
    expect(result.inIframe).toBe(true);
  });
});

/** A `Page` double exposing only `locator()`, which is all `clickAndVerify` uses. */
function pageWith(locators: Record<string, unknown>): Page {
  return {
    locator: (selector: string) => ({
      first: () => locators[selector] ?? locators["*"],
    }),
  } as unknown as Page;
}

const okLocator = (text = "Accept all") => ({
  waitFor: vi.fn(async () => undefined),
  textContent: vi.fn(async () => text),
  click: vi.fn(async () => undefined),
});

describe("clickAndVerify", () => {
  it("records the button text it actually clicked", async () => {
    const button = okLocator("  Accept all  ");
    const result = await clickAndVerify(
      pageWith({ "#accept": button }),
      "#accept",
      "adapter_selector",
      0.95,
      null,
    );

    expect(result.performed).toBe(true);
    // Trimmed: the recorded text is shown to a user as evidence of which
    // control was pressed, and leading whitespace from the DOM is noise.
    expect(result.elementText).toBe("Accept all");
    expect(result.selectorUsed).toBe("#accept");
    expect(button.click).toHaveBeenCalled();
  });

  it("caps the recorded text at 120 characters", async () => {
    // A banner with a paragraph inside its button would otherwise put an
    // unbounded chunk of page text into evidence — and into the AI context.
    const result = await clickAndVerify(
      pageWith({ "#accept": okLocator("x".repeat(500)) }),
      "#accept",
      "adapter_selector",
      0.95,
      null,
    );
    expect(result.elementText).toHaveLength(120);
  });

  it("fails with BUTTON_NOT_FOUND when the control never becomes visible", async () => {
    const invisible = {
      waitFor: vi.fn(async () => {
        throw new Error("timeout");
      }),
      textContent: vi.fn(),
      click: vi.fn(),
    };

    const result = await clickAndVerify(
      pageWith({ "#accept": invisible }),
      "#accept",
      "adapter_selector",
      0.95,
      null,
    );

    expect(result.performed).toBe(false);
    expect(result.errorCode).toBe("CONSENT_BUTTON_NOT_FOUND");
    // ⚠️ It must NOT have clicked. A click on a control we could not confirm is
    // visible is a click on whatever happens to be at those coordinates.
    expect(invisible.click).not.toHaveBeenCalled();
  });

  it("fails with CLICK_FAILED when the click itself throws", async () => {
    const result = await clickAndVerify(
      pageWith({
        "#accept": {
          waitFor: vi.fn(async () => undefined),
          textContent: vi.fn(async () => "Accept"),
          click: vi.fn(async () => {
            throw new Error("intercepted by overlay");
          }),
        },
      }),
      "#accept",
      "adapter_selector",
      0.95,
      null,
    );

    expect(result.errorCode).toBe("CONSENT_CLICK_FAILED");
    expect(result.errorMessage).toContain("intercepted by overlay");
  });

  it("reports bannerDismissed TRUE when the banner disappears", async () => {
    const page = {
      locator: (selector: string) => ({
        first: () =>
          selector === "#accept"
            ? okLocator()
            : { waitFor: vi.fn(async () => undefined) },
      }),
    } as unknown as Page;

    const result = await clickAndVerify(page, "#accept", "adapter_selector", 0.95, "#banner");
    expect(result.bannerDismissed).toBe(true);
  });

  it("reports bannerDismissed FALSE without failing the action", async () => {
    /*
     * ⚠️ §4.6: "`bannerDismissed` is recorded, not required." Some CMPs leave a
     * small settings tab behind after a choice, so a still-present banner does
     * not prove the click failed. Treating it as a failure here would discard a
     * genuine ACCEPT_ALL journey on those platforms — the rule engine decides
     * what it means, the adapter does not get to judge.
     */
    const page = {
      locator: (selector: string) => ({
        first: () =>
          selector === "#accept"
            ? okLocator()
            : {
                waitFor: vi.fn(async () => {
                  throw new Error("still visible");
                }),
              },
      }),
    } as unknown as Page;

    const result = await clickAndVerify(page, "#accept", "adapter_selector", 0.95, "#banner");
    expect(result.performed).toBe(true);
    expect(result.bannerDismissed).toBe(false);
  });

  it("leaves bannerDismissed UNKNOWN when no banner selector is given", async () => {
    // null ≠ false. We did not look, so we do not know — the same distinction
    // the product's own vocabulary makes ("could not be determined").
    const result = await clickAndVerify(
      pageWith({ "#accept": okLocator() }),
      "#accept",
      "adapter_selector",
      0.95,
      null,
    );
    expect(result.bannerDismissed).toBeNull();
  });
});
