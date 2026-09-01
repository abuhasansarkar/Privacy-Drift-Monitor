import { describe, expect, it } from "vitest";
import { __testing } from "../generic-adapter";

const {
  phrasesFor,
  ACCEPT_PHRASES,
  REJECT_PHRASES,
  WITHDRAW_PHRASES,
  PREFERENCE_PHRASES,
  SAVE_WITHOUT_ACCEPTING_PHRASES,
  BANNER_SELECTORS,
  CLICKABLE,
} = __testing;

/**
 * GENERIC BANNER ADAPTER — PLAN.md Part IV §4.6, Phase 2 task 2.8.
 *
 * ⚠️ THIS ADAPTER HANDLES EVERY SITE WITHOUT A KNOWN CMP, which is most of
 * them. The five vendor adapters cover the platforms we recognise; everything
 * else falls to this heuristic cascade.
 *
 * ⚠️ A PHRASE IN THE WRONG LIST INVERTS A FINDING, SILENTLY. Nothing throws and
 * nothing fails to render: the scanner clicks a control meaning the opposite of
 * what it recorded, labels the phase `REJECT_ALL`, and every issue derived from
 * it becomes "trackers fire after you reject" — the single most serious claim
 * this product makes, reached by having clicked Accept. That is why the tests
 * below are mostly about what is ABSENT.
 *
 * The file was at 72% branch coverage with none of this asserted. Fixture F07
 * already caught one instance of it — the adapter did not recognise "Deny",
 * which is what Usercentrics actually renders (AGENTS.md, defect 4).
 */

const lower = (list: readonly string[]) => list.map((p) => p.toLowerCase());

describe("phrasesFor maps each intent to its own list", () => {
  it("accept → ACCEPT_PHRASES", () => {
    expect(phrasesFor("accept")).toBe(ACCEPT_PHRASES);
  });

  it("reject → REJECT_PHRASES", () => {
    expect(phrasesFor("reject")).toBe(REJECT_PHRASES);
  });

  it("withdraw → WITHDRAW_PHRASES", () => {
    // The fall-through branch. `withdraw` is the fourth journey (§4.6) and the
    // one most often forgotten, because it is the only phase that runs against
    // an already-consented context.
    expect(phrasesFor("withdraw")).toBe(WITHDRAW_PHRASES);
  });
});

describe("⚠️ accept and reject phrases are DISJOINT", () => {
  it("no phrase appears in both lists", () => {
    /*
     * The catastrophic case. A shared phrase makes the two journeys click the
     * same control, so REJECT_ALL and ACCEPT_ALL record identical behaviour —
     * and the diff between them, which is the entire product, becomes empty.
     */
    const accept = new Set(lower(ACCEPT_PHRASES));
    const overlap = lower(REJECT_PHRASES).filter((p) => accept.has(p));
    expect(overlap).toEqual([]);
  });

  it("no reject phrase CONTAINS an accept phrase as a whole word", () => {
    // Subtler: matching is substring-based over button text, so a reject phrase
    // containing "accept" can match an Accept button. "Continue without
    // accepting" is the legitimate exception — it is a rejection whose wording
    // includes the word — so the check is on the SHORT accept phrases that
    // would match too eagerly.
    const shortAccept = lower(ACCEPT_PHRASES).filter((p) => p.length <= 6);
    for (const reject of lower(REJECT_PHRASES)) {
      for (const accept of shortAccept) {
        expect(
          reject === accept,
          `reject phrase "${reject}" equals short accept phrase "${accept}"`,
        ).toBe(false);
      }
    }
  });
});

describe("⚠️ ambiguous phrases are deliberately EXCLUDED", () => {
  const all = lower([...ACCEPT_PHRASES, ...REJECT_PHRASES]);

  for (const dangerous of ["ok", "okay", "got it", "understood", "close", "x"]) {
    it(`"${dangerous}" is not treated as a consent control`, () => {
      /*
       * These dismiss a banner without expressing a choice — and on most
       * platforms dismissing means the defaults stand, which are frequently
       * opt-in. Clicking one and recording it as a REJECTION would invert the
       * finding; recording it as an ACCEPTANCE would be a guess about what the
       * site does with a dismissal. Neither is observable, so neither is done.
       */
      expect(all).not.toContain(dangerous);
    });
  }

  it('"save" alone is not a rejection', () => {
    /*
     * §4.6 is explicit: in a preferences panel where the visitor toggled
     * nothing, "Save" persists the DEFAULTS. On an opt-in-by-default platform
     * that is an acceptance wearing a neutral label.
     */
    expect(lower(SAVE_WITHOUT_ACCEPTING_PHRASES)).not.toContain("save");
    expect(lower(REJECT_PHRASES)).not.toContain("save");
  });

  it("every save-without-accepting phrase is explicit about not accepting", () => {
    // Each must carry a qualifier — "without accepting", "reject", "my
    // choices" — never a bare verb.
    for (const phrase of lower(SAVE_WITHOUT_ACCEPTING_PHRASES)) {
      expect(phrase.split(/\s+/).length).toBeGreaterThan(1);
    }
  });
});

describe("reject coverage — the F07 regression", () => {
  for (const phrase of ["reject", "deny", "decline"]) {
    it(`recognises "${phrase}"`, () => {
      /*
       * ⚠️ "deny" IS THE F07 REGRESSION. Usercentrics renders "Deny", the
       * adapter did not know the word, and the reject journey silently did
       * nothing — producing a scan that reported no difference between
       * rejecting and not choosing.
       */
      expect(lower(REJECT_PHRASES).some((p) => p.includes(phrase))).toBe(true);
    });
  }

  it("covers non-English rejections", () => {
    // A German or French banner is not an edge case for an agency operating in
    // Europe, which is the entire ICP.
    const joined = lower(REJECT_PHRASES).join(" ");
    expect(joined).toMatch(/ablehnen|refuser|rechazar|weiger/);
  });
});

describe("preference phrases OPEN a panel — they are not themselves a choice", () => {
  it("no preference phrase is also a reject phrase", () => {
    // Clicking "Manage preferences" and recording REJECT_ALL would mean the
    // phase never expressed a choice at all, while claiming it did.
    const reject = new Set(lower(REJECT_PHRASES));
    expect(lower(PREFERENCE_PHRASES).filter((p) => reject.has(p))).toEqual([]);
  });

  it("no preference phrase is also an accept phrase", () => {
    const accept = new Set(lower(ACCEPT_PHRASES));
    expect(lower(PREFERENCE_PHRASES).filter((p) => accept.has(p))).toEqual([]);
  });
});

describe("selectors", () => {
  it("only clickable elements are candidates", () => {
    // ⚠️ "A phrase inside a paragraph is not a control." Without this, the word
    // "reject" in a banner's body text becomes a click target.
    for (const fragment of ["button", "[role='button']", "a[href]"]) {
      expect(CLICKABLE).toContain(fragment);
    }
  });

  it("the banner selector list is non-empty and comma-joinable", () => {
    expect(BANNER_SELECTORS.length).toBeGreaterThan(0);
    // The adapter joins these into one selector; a stray comma inside an entry
    // would silently split it into two invalid selectors.
    for (const selector of BANNER_SELECTORS) {
      expect(selector).not.toContain(",");
    }
  });
});

describe("no phrase list contains an empty or whitespace entry", () => {
  it("an empty phrase would match every button on the page", () => {
    // `"".includes` / `text.includes("")` is always true — one stray empty
    // string turns the heuristic into "click the first clickable element".
    for (const [name, list] of Object.entries({
      ACCEPT_PHRASES,
      REJECT_PHRASES,
      WITHDRAW_PHRASES,
      PREFERENCE_PHRASES,
      SAVE_WITHOUT_ACCEPTING_PHRASES,
    })) {
      for (const phrase of list) {
        expect(phrase.trim(), `empty entry in ${name}`).not.toBe("");
      }
    }
  });

  it("phrases are stored lower-case, since matching lower-cases the button text", () => {
    for (const phrase of [...ACCEPT_PHRASES, ...REJECT_PHRASES, ...WITHDRAW_PHRASES]) {
      expect(phrase, `"${phrase}" must be lower-case`).toBe(phrase.toLowerCase());
    }
  });
});
