import type { Page } from "playwright";
import type { ConsentActionResult } from "../phase-runner";
import type { CmpDetectionResult, ConsentMethod } from "../types";

/**
 * CONSENT ADAPTER FRAMEWORK — PLAN.md Part IV §4.6, Phase 2 task 2.6.
 *
 * A CMP adapter knows how to do three things on one consent platform: say
 * whether it is present, click Reject All, and click Accept All. Nothing else.
 *
 * ⚠️ AN ADAPTER MAY NEVER REPORT SUCCESS IT DID NOT VERIFY. Every action here
 * returns `performed: false` with an error code rather than assuming a click
 * landed. A Reject-All we *think* we clicked, but did not, produces a
 * recording that looks like "the site sets no cookies after rejection" — the
 * most damaging false negative this product can emit (§4.6, P5).
 *
 * ⚠️ CONFIDENCE IS PART OF THE EVIDENCE. `ConsentMethod` is ordered by
 * trustworthiness: an `adapter_selector` match on a known CMP is not the same
 * claim as a `dom_heuristic` guess on an unknown banner, and the UI shows the
 * difference rather than presenting both as "we clicked Reject".
 */

export type ConsentIntent = "reject" | "accept" | "withdraw";

export interface ConsentAdapter {
  /** Stable id — persisted on the scan so drift can see the CMP change. */
  id: string;
  name: string;
  /**
   * Is this CMP on the page? Runs before any click, and must be cheap and
   * side-effect free: detection that mutates the page changes the very
   * behaviour we are about to record.
   */
  detect(page: Page): Promise<CmpDetectionResult | null>;
  /** Performs one consent action, or explains why it could not. */
  perform(page: Page, intent: ConsentIntent): Promise<ConsentActionResult>;
}

export function actionFailure(
  errorCode: ConsentActionResult["errorCode"],
  errorMessage: string,
): ConsentActionResult {
  return {
    performed: false,
    method: null,
    confidence: null,
    selectorUsed: null,
    elementText: null,
    inIframe: false,
    bannerDismissed: null,
    errorCode,
    errorMessage,
  };
}

export function actionSuccess(params: {
  method: ConsentMethod;
  confidence: number;
  selectorUsed: string | null;
  elementText: string | null;
  inIframe?: boolean;
  bannerDismissed: boolean | null;
}): ConsentActionResult {
  return {
    performed: true,
    method: params.method,
    confidence: params.confidence,
    selectorUsed: params.selectorUsed,
    elementText: params.elementText,
    inIframe: params.inIframe ?? false,
    bannerDismissed: params.bannerDismissed,
    errorCode: null,
    errorMessage: null,
  };
}

/**
 * Clicks a locator and reports whether the banner actually went away.
 *
 * ⚠️ `bannerDismissed` is recorded, not required. Some CMPs leave a small
 * "cookie settings" tab behind after a choice, so a still-present banner does
 * not prove the click failed. It IS a signal worth storing, and the rule engine
 * decides what it means — the adapter does not get to judge.
 */
export async function clickAndVerify(
  page: Page,
  selector: string,
  method: ConsentMethod,
  confidence: number,
  bannerSelector: string | null,
): Promise<ConsentActionResult> {
  const locator = page.locator(selector).first();

  let text: string | null = null;
  try {
    // A short timeout: the banner is either up by now or the CMP did not load.
    // Waiting 30s here would multiply across four phases for no information.
    await locator.waitFor({ state: "visible", timeout: 5_000 });
    text = (await locator.textContent())?.trim().slice(0, 120) ?? null;
  } catch {
    return actionFailure(
      "CONSENT_BUTTON_NOT_FOUND",
      `control not visible: ${selector}`,
    );
  }

  try {
    await locator.click({ timeout: 5_000 });
  } catch (error) {
    return actionFailure(
      "CONSENT_CLICK_FAILED",
      error instanceof Error ? error.message : "click failed",
    );
  }

  let bannerDismissed: boolean | null = null;
  if (bannerSelector) {
    bannerDismissed = await page
      .locator(bannerSelector)
      .first()
      .waitFor({ state: "hidden", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
  }

  return actionSuccess({
    method,
    confidence,
    selectorUsed: selector,
    elementText: text,
    bannerDismissed,
  });
}

/**
 * Resolution cascade (§4.6).
 *
 * Adapters are tried in order and the FIRST that detects wins. Ordering is
 * deliberate: specific CMP adapters before the generic heuristic, because a
 * known platform gives a `adapter_selector` match with high confidence while
 * the generic cascade is a guess — and taking the guess when a certainty was
 * available would downgrade the evidence for no reason.
 */
export async function resolveAdapter(
  page: Page,
  adapters: readonly ConsentAdapter[],
): Promise<{ adapter: ConsentAdapter; detection: CmpDetectionResult } | null> {
  for (const adapter of adapters) {
    // A broken adapter must not stop the cascade — the next one may work, and
    // the generic fallback almost certainly will.
    const detection = await adapter.detect(page).catch(() => null);
    if (detection) return { adapter, detection };
  }
  return null;
}
