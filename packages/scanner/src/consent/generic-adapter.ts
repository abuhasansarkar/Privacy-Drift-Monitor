import type { Locator, Page } from "playwright";
import {
  actionFailure,
  actionSuccess,
  type ConsentAdapter,
  type ConsentIntent,
} from "./adapter";
import type { CmpDetectionResult, ConsentMethod } from "../types";

/**
 * GENERIC BANNER ADAPTER — PLAN.md Part IV §4.6, Phase 2 task 2.8.
 *
 * The fallback for the long tail: bespoke banners, small plugins, and CMPs we
 * have no adapter for. It runs a four-strategy cascade, ordered by how much the
 * match actually proves:
 *
 *   1. accessible_name — a button whose ACCESSIBLE NAME says reject. Strongest
 *      heuristic available: it is the same thing a screen-reader user acts on.
 *   2. text_match      — visible text against a multi-language phrase list.
 *   3. dom_heuristic   — a control inside something banner-shaped, by id/class.
 *   4. preferences     — open the preferences panel and look again (reject only).
 *   5. give up         — UNDETERMINED, with a code.
 *
 * ⚠️ STRATEGY 4 IS A FEATURE. The temptation is to click the most
 * banner-looking thing and move on; that produces a scan which reports "no
 * cookies after Reject All" because it dismissed the banner with **Accept**.
 * Ambiguity is reported, never resolved by guessing (§4.6).
 *
 * ⚠️ REJECT PHRASES EXCLUDE "OK" AND "GOT IT". Those dismiss a banner without
 * rejecting anything, and treating them as a rejection would invert the finding.
 */

/** Ordered most-specific first; the first hit wins within a strategy. */
const REJECT_PHRASES = [
  "reject all",
  "decline all",
  "refuse all",
  "deny all",
  "reject",
  "decline",
  /*
   * ⚠️ Bare "deny" is what Usercentrics actually renders (fixture F07), and it
   * is unambiguous in a consent banner in a way "OK" and "Got it" are not.
   * It sits AFTER the "… all" forms so the more specific phrase still wins.
   */
  "deny",
  "refuse",
  "necessary only",
  "only necessary",
  "essential only",
  "only essential",
  "continue without accepting",
  // German / French / Spanish / Dutch — our ICP's markets (§1.3).
  "alle ablehnen",
  "ablehnen",
  "nur notwendige",
  "tout refuser",
  "refuser",
  "continuer sans accepter",
  "rechazar todo",
  "rechazar",
  "alles weigeren",
  "weigeren",
];

const ACCEPT_PHRASES = [
  "accept all",
  "allow all",
  "agree to all",
  "accept",
  "agree",
  "allow cookies",
  "alle akzeptieren",
  "akzeptieren",
  "zustimmen",
  "tout accepter",
  "accepter",
  "aceptar todo",
  "aceptar",
  "alles accepteren",
  "accepteren",
];

const WITHDRAW_PHRASES = [
  "cookie settings",
  "cookie preferences",
  "manage cookies",
  "privacy settings",
  "manage consent",
  "cookie-einstellungen",
  "paramètres des cookies",
  "configurar cookies",
];

/** Containers that are banner-shaped. Used only by the weakest strategy. */
const BANNER_SELECTORS = [
  "[role='dialog']",
  "[aria-label*='cookie' i]",
  "[id*='cookie' i]",
  "[class*='cookie' i]",
  "[id*='consent' i]",
  "[class*='consent' i]",
  "[id*='gdpr' i]",
  "[class*='gdpr' i]",
];

const BANNER_SELECTOR = BANNER_SELECTORS.join(", ");

function phrasesFor(intent: ConsentIntent): string[] {
  if (intent === "accept") return ACCEPT_PHRASES;
  if (intent === "reject") return REJECT_PHRASES;
  return WITHDRAW_PHRASES;
}

/** Clickables only — a phrase inside a paragraph is not a control. */
const CLICKABLE = "button, a[href], [role='button'], input[type='button'], input[type='submit']";

interface Candidate {
  locator: Locator;
  selector: string;
  text: string;
  method: ConsentMethod;
  confidence: number;
}

async function firstVisible(locator: Locator): Promise<boolean> {
  return locator
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}

/**
 * Strategy 1 — accessible name.
 *
 * `getByRole` matches on the accessible name, which folds in `aria-label` and
 * `aria-labelledby`. A button labelled for assistive tech is the closest thing
 * to a machine-readable intent that an unknown banner offers.
 */
async function byAccessibleName(
  page: Page,
  phrases: string[],
): Promise<Candidate | null> {
  for (const phrase of phrases) {
    for (const role of ["button", "link"] as const) {
      const locator = page.getByRole(role, {
        name: new RegExp(`^\\s*${phrase}\\s*$`, "i"),
      });
      if (!(await firstVisible(locator))) continue;
      const text = (await locator.first().textContent())?.trim().slice(0, 120) ?? phrase;
      return {
        locator: locator.first(),
        selector: `role=${role}[name="${phrase}"]`,
        text,
        method: "accessible_name",
        confidence: 0.8,
      };
    }
  }
  return null;
}

/** Strategy 2 — exact-ish visible text on a clickable element. */
async function byText(page: Page, phrases: string[]): Promise<Candidate | null> {
  for (const phrase of phrases) {
    const locator = page
      .locator(CLICKABLE)
      .filter({ hasText: new RegExp(`^\\s*${phrase}\\s*$`, "i") });
    if (!(await firstVisible(locator))) continue;
    const text = (await locator.first().textContent())?.trim().slice(0, 120) ?? phrase;
    return {
      locator: locator.first(),
      selector: `text=${phrase}`,
      text,
      method: "text_match",
      confidence: 0.65,
    };
  }
  return null;
}

/**
 * Strategy 3 — a control inside a banner-shaped container, matched loosely.
 *
 * Scoped to the container on purpose: an unscoped "contains reject" match finds
 * the footer link on a privacy policy page and clicks it.
 */
async function byDomHeuristic(
  page: Page,
  phrases: string[],
): Promise<Candidate | null> {
  const banner = page.locator(BANNER_SELECTOR).first();
  if (!(await firstVisible(banner))) return null;

  for (const phrase of phrases) {
    const locator = banner
      .locator(CLICKABLE)
      .filter({ hasText: new RegExp(phrase, "i") });
    if (!(await firstVisible(locator))) continue;
    const text = (await locator.first().textContent())?.trim().slice(0, 120) ?? phrase;
    return {
      locator: locator.first(),
      selector: `banner >> text~=${phrase}`,
      text,
      method: "dom_heuristic",
      // Deliberately below the §4.6 minimum-confidence floor's comfortable
      // range: this is a guess, and the UI must be able to say so.
      confidence: 0.5,
    };
  }
  return null;
}

/**
 * Strategy 4 — open the preferences panel, then look for reject inside it.
 *
 * ⚠️ REJECT ONLY. Opening preferences to find ACCEPT would be absurd — accept
 * is always at the top level — and opening it for WITHDRAW is what the withdraw
 * phrases already do. This exists for the common pattern where the banner
 * offers "Accept all" and "Manage preferences" and nothing else.
 *
 * ⚠️ THE RESULT IS RECORDED AS `preferences_fallback`, not as whichever
 * strategy found the control inside the panel. PDM-R011 fires on that method:
 * rejecting was possible, but it took an extra step that accepting did not.
 */
async function byPreferencesPanel(
  page: Page,
  phrases: string[],
): Promise<Candidate | null> {
  const opener =
    (await byAccessibleName(page, PREFERENCE_PHRASES)) ??
    (await byText(page, PREFERENCE_PHRASES)) ??
    (await byDomHeuristic(page, PREFERENCE_PHRASES));
  if (!opener) return null;

  try {
    await opener.locator.click({ timeout: 5_000 });
  } catch {
    // The panel would not open. That is not a reject failure with a different
    // cause — it is still "we could not find a way to reject".
    return null;
  }

  // Give the panel a moment to render before looking inside it.
  await page.waitForTimeout(500);

  const inside =
    (await byAccessibleName(page, [...phrases, ...SAVE_WITHOUT_ACCEPTING_PHRASES])) ??
    (await byText(page, [...phrases, ...SAVE_WITHOUT_ACCEPTING_PHRASES]));
  if (!inside) return null;

  return {
    ...inside,
    method: "preferences_fallback",
    selector: `preferences >> ${inside.selector}`,
    // Below the direct strategies: two clicks and an assumption about which
    // panel opened is materially weaker evidence than one labelled button.
    confidence: Math.min(inside.confidence, 0.6),
  };
}

/** Controls that OPEN a preferences panel. Not themselves a rejection. */
const PREFERENCE_PHRASES = [
  "manage preferences",
  "cookie preferences",
  "manage cookies",
  "customize",
  "customise",
  "settings",
  "einstellungen",
  "personnaliser",
  "configurar",
];

/**
 * Controls INSIDE a preferences panel that mean "reject".
 *
 * ⚠️ "Save" alone is absent, deliberately. In a panel where the visitor has
 * toggled nothing, "Save" may persist the defaults — which on many platforms
 * are opt-in. Clicking it and calling the result a rejection would invert the
 * finding, which is the same trap "OK" and "Got it" are excluded for.
 */
const SAVE_WITHOUT_ACCEPTING_PHRASES = [
  "save without accepting",
  "continue without accepting",
  "save my preferences",
  "confirm my choices",
  "reject non-essential",
];

export const GENERIC_ADAPTER: ConsentAdapter = {
  id: "generic",
  name: "Generic banner",

  async detect(page: Page): Promise<CmpDetectionResult | null> {
    const banner = page.locator(BANNER_SELECTOR).first();
    if (!(await firstVisible(banner))) return null;

    return {
      cmpId: "generic",
      cmpName: "Generic banner",
      version: null,
      // Low by construction: "something banner-shaped is on the page" is a much
      // weaker claim than "Cookiebot is installed", and the score must say so.
      confidence: 0.4,
      signals: ["banner-shaped container"],
    };
  },

  async perform(page, intent) {
    const phrases = phrasesFor(intent);

    const candidate =
      (await byAccessibleName(page, phrases)) ??
      (await byText(page, phrases)) ??
      (await byDomHeuristic(page, phrases)) ??
      // Strategy 4, reject only — see `byPreferencesPanel`.
      (intent === "reject" ? await byPreferencesPanel(page, phrases) : null);

    if (!candidate) {
      // Strategy 5. A banner with no control we can identify for this intent —
      // fixture X02's accept-only banner is exactly this case, and the answer
      // is UNDETERMINED, not "rejected with no effect".
      return actionFailure(
        "CONSENT_BUTTON_NOT_FOUND",
        `no ${intent} control identified on the banner`,
      );
    }

    try {
      await candidate.locator.click({ timeout: 5_000 });
    } catch (error) {
      return actionFailure(
        "CONSENT_CLICK_FAILED",
        error instanceof Error ? error.message : "click failed",
      );
    }

    const bannerDismissed = await page
      .locator(BANNER_SELECTOR)
      .first()
      .waitFor({ state: "hidden", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    return actionSuccess({
      method: candidate.method,
      confidence: candidate.confidence,
      selectorUsed: candidate.selector,
      elementText: candidate.text,
      bannerDismissed,
    });
  },
};
