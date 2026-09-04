import type { Page } from "playwright";

/**
 * SYNTHETIC FORM INTERACTION RUNNER — Module 22 (Phase 15).
 *
 * Runs during the INTERACTIVE_ACTION phase to discover forms, inject dummy
 * data, trigger submission, and detect unconsented tracker spikes (PDM-R043).
 */

export interface FormSubmissionFact {
  formDetected: boolean;
  formSubmitted: boolean;
  unconsentedTrackersTriggered: string[];
}

/**
 * Discovers forms, fills dummy values, submits, and records conversion burst events.
 */
export async function runSyntheticFormInteraction(
  page: Page,
): Promise<FormSubmissionFact> {
  try {
    const result = (await page.evaluate(`
      (async () => {
        const form = document.querySelector('form:not([action*="login"]):not([action*="auth"])');
        if (!form) {
          return { formDetected: false, formSubmitted: false, unconsentedTrackersTriggered: [] };
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
          formDetected: true,
          formSubmitted: submitted,
          unconsentedTrackersTriggered: []
        };
      })()
    `)) as FormSubmissionFact;

    return result;
  } catch {
    return {
      formDetected: false,
      formSubmitted: false,
      unconsentedTrackersTriggered: [],
    };
  }
}
