import type { Page } from "playwright";
import {
  actionFailure,
  clickAndVerify,
  type ConsentAdapter,
  type ConsentIntent,
} from "./adapter";
import type { CmpDetectionResult } from "../types";

/**
 * CMP ADAPTERS — PLAN.md Part IV §4.6, Phase 2 task 2.7.
 *
 * Five platforms cover the large majority of the European long tail our ICP
 * manages. Each is a table of selectors plus a detection signal, deliberately
 * declarative: a CMP that ships a redesign should be a selector change, not a
 * rewrite, and a reviewer should be able to check an adapter against the
 * vendor's docs without reading control flow.
 *
 * ⚠️ DETECTION IS SIDE-EFFECT FREE. Every `detect` below reads a global or a
 * DOM node and nothing else. Detection that clicks, scrolls or injects would
 * change the behaviour we are about to record, and the recording is the product.
 *
 * ⚠️ NO ADAPTER GUESSES. If a CMP is present but the control for the requested
 * intent is not, the adapter fails with a code — it does not fall through to a
 * text match. That fallback is the generic adapter's job, and mixing the two
 * would make an `adapter_selector` claim out of a heuristic guess.
 */

interface AdapterSpec {
  id: string;
  name: string;
  /** JS expression evaluated in the page; truthy means present. */
  detectExpression: string;
  /** Signals recorded alongside the detection, for the evidence trail. */
  signals: string[];
  banner: string;
  reject: string | null;
  accept: string;
  /** Where the user withdraws consent later — the fourth journey (§4.3). */
  preferences: string | null;
  confidence: number;
}

const SPECS: AdapterSpec[] = [
  {
    id: "cookiebot",
    name: "Cookiebot",
    detectExpression: "!!window.Cookiebot || !!document.getElementById('CybotCookiebotDialog')",
    signals: ["window.Cookiebot", "#CybotCookiebotDialog"],
    banner: "#CybotCookiebotDialog",
    reject: "#CybotCookiebotDialogBodyButtonDecline",
    accept: "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    preferences: "#CybotCookiebotDialogBodyEdgeMoreDetails a",
    confidence: 0.95,
  },
  {
    id: "cookieyes",
    name: "CookieYes",
    detectExpression: "!!document.querySelector('.cky-consent-container, #cookie-law-info-bar')",
    signals: [".cky-consent-container"],
    banner: ".cky-consent-container",
    reject: ".cky-btn-reject",
    accept: ".cky-btn-accept",
    preferences: ".cky-btn-customize",
    confidence: 0.9,
  },
  {
    id: "complianz",
    name: "Complianz",
    detectExpression: "!!document.querySelector('#cmplz-cookiebanner-container, .cmplz-cookiebanner')",
    signals: [".cmplz-cookiebanner"],
    banner: ".cmplz-cookiebanner",
    reject: ".cmplz-deny",
    accept: ".cmplz-accept",
    preferences: ".cmplz-manage-options",
    confidence: 0.9,
  },
  {
    id: "onetrust",
    name: "OneTrust",
    detectExpression: "!!window.OneTrust || !!document.getElementById('onetrust-banner-sdk')",
    signals: ["window.OneTrust", "#onetrust-banner-sdk"],
    banner: "#onetrust-banner-sdk",
    reject: "#onetrust-reject-all-handler",
    accept: "#onetrust-accept-btn-handler",
    preferences: "#onetrust-pc-btn-handler",
    confidence: 0.95,
  },
  {
    id: "usercentrics",
    name: "Usercentrics",
    // Usercentrics renders inside a shadow root. Playwright's selector engine
    // pierces OPEN shadow roots automatically, which is why the selectors below
    // are plain CSS — no `>>>` combinator is needed and none should be added.
    detectExpression:
      "!!window.UC_UI || !!document.querySelector('#usercentrics-root, [id^=\"usercentrics\"]')",
    signals: ["window.UC_UI", "#usercentrics-root"],
    banner: "#usercentrics-root",
    reject: "[data-testid='uc-deny-all-button']",
    accept: "[data-testid='uc-accept-all-button']",
    preferences: "[data-testid='uc-more-button']",
    confidence: 0.9,
  },
];

function selectorFor(spec: AdapterSpec, intent: ConsentIntent): string | null {
  if (intent === "accept") return spec.accept;
  if (intent === "reject") return spec.reject;
  return spec.preferences;
}

function buildAdapter(spec: AdapterSpec): ConsentAdapter {
  return {
    id: spec.id,
    name: spec.name,

    async detect(page: Page): Promise<CmpDetectionResult | null> {
      // String expression: `window`/`document` need the DOM lib, which this
      // Node package deliberately does not load. Same note as recorders.ts.
      const present = await page
        .evaluate<boolean>(`!!(${spec.detectExpression})`)
        .catch(() => false);
      if (!present) return null;

      return {
        cmpId: spec.id,
        cmpName: spec.name,
        // Version detection differs per vendor and is not worth a wrong guess:
        // null means "not determined", which is honest.
        version: null,
        confidence: spec.confidence,
        signals: spec.signals,
      };
    },

    async perform(page, intent) {
      const selector = selectorFor(spec, intent);

      if (!selector) {
        // The CMP is present but offers no control for this intent — e.g. a
        // Cookiebot install with no decline button. UNDETERMINED, never "no
        // trackers after rejection".
        return actionFailure(
          intent === "withdraw"
            ? "CONSENT_WITHDRAW_UNSUPPORTED"
            : "CONSENT_BUTTON_NOT_FOUND",
          `${spec.name} exposes no ${intent} control`,
        );
      }

      return clickAndVerify(
        page,
        selector,
        "adapter_selector",
        spec.confidence,
        spec.banner,
      );
    },
  };
}

export const CMP_ADAPTERS: readonly ConsentAdapter[] = SPECS.map(buildAdapter);

export const CMP_ADAPTER_IDS = SPECS.map((spec) => spec.id);
