import type { Page } from "playwright";

/**
 * SYNTHETIC FORM INTERACTION RUNNER — Module 22 (Phase 15).
 *
 * Runs during the INTERACTIVE_ACTION phase to discover forms, inject dummy
 * data, and trigger submission. The burst of requests that follows is counted
 * by the PHASE RUNNER from its own network recorder — this module deliberately
 * reports only what the DOM can tell it.
 */

export interface FormDomFacts {
  formFound: boolean;
  formSubmitted: boolean;
}

/**
 * Discovers a form, fills dummy values, and submits it.
 *
 * Returns only what the DOM could tell us. `formFound: false` covers both "no
 * form on the page" and "the page could not be evaluated" — neither is an
 * observation of absence, and the rule treats both as no finding.
 */
export async function runSyntheticFormInteraction(
  page: Page,
): Promise<FormDomFacts> {
  try {
    const result = (await page.evaluate(`
      (async () => {
        const form = document.querySelector('form:not([action*="login"]):not([action*="auth"])');
        if (!form) {
          return { formFound: false, formSubmitted: false };
        }

        // Fill dummy fields
        const emailInputs = Array.from(form.querySelectorAll('input[type="email"], input[name*="email" i]'));
        for (const input of emailInputs) {
          input.value = "dummy-audit@example.invalid";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const textInputs = Array.from(form.querySelectorAll('input[type="text"], input[name*="name" i]'));
        for (const input of textInputs) {
          input.value = "Privacy Drift Test";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"])');
        let submitted = false;

        if (submitBtn) {
          try {
            submitBtn.click();
            submitted = true;
          } catch (_) {}
        } else {
          try {
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            submitted = true;
          } catch (_) {}
        }

        return {
          formFound: true,
          formSubmitted: submitted
        };
      })()
    `)) as { formFound: boolean; formSubmitted: boolean };

    return result;
  } catch {
    return { formFound: false, formSubmitted: false };
  }
}
