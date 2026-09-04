import { describe, expect, it } from "vitest";
import {
  parseConsentModeEvents,
  type RecordedConsentEvent,
} from "../instrumentation/consent-mode";

describe("Google Consent Mode v2 — Event Parsing & Auditing", () => {
  it("returns isConsentModeDetected: false when no consent events occurred", () => {
    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [] },
      { phase: "REJECT_ALL", events: [] },
    ]);

    expect(audit.isConsentModeDetected).toBe(false);
    expect(audit.issuesDetected).toEqual([]);
    expect(audit.preConsentAdStorage).toBeNull();
    expect(audit.postRejectAdStorage).toBeNull();
  });

  it("detects pre-consent granted signals and flags PDM-R051 (Critical)", () => {
    const defaultEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "default",
      data: {
        ad_storage: "granted",
        analytics_storage: "denied",
        ad_user_data: "granted",
        ad_personalization: "granted",
      },
      timestamp: 1000,
    };

    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [defaultEvent] },
    ]);

    expect(audit.isConsentModeDetected).toBe(true);
    expect(audit.preConsentAdStorage).toBe("granted");
    expect(audit.preConsentAnalytics).toBe("denied");
    expect(audit.issuesDetected).toContain("PDM-R051");
  });

  it("handles valid pre-consent denied signals cleanly without PDM-R051", () => {
    const defaultEvent: RecordedConsentEvent = {
      source: "dataLayer",
      type: "push",
      data: [
        "consent",
        "default",
        {
          ad_storage: "denied",
          analytics_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        },
      ],
      timestamp: 1000,
    };

    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [defaultEvent] },
    ]);

    expect(audit.isConsentModeDetected).toBe(true);
    expect(audit.preConsentAdStorage).toBe("denied");
    expect(audit.preConsentAnalytics).toBe("denied");
    expect(audit.issuesDetected).not.toContain("PDM-R051");
  });

  it("flags PDM-R052 when Reject All phase runs but no consent update occurs", () => {
    const defaultEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "default",
      data: {
        ad_storage: "denied",
        analytics_storage: "denied",
      },
      timestamp: 1000,
    };

    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [defaultEvent] },
      { phase: "REJECT_ALL", events: [] }, // No update dispatched on reject!
    ]);

    expect(audit.isConsentModeDetected).toBe(true);
    expect(audit.issuesDetected).toContain("PDM-R052");
  });

  it("flags PDM-R052 when Reject All update leaves parameters as granted", () => {
    const defaultEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "default",
      data: {
        ad_storage: "denied",
        analytics_storage: "denied",
      },
      timestamp: 1000,
    };

    const rejectUpdateEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "update",
      data: {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "granted", // rogue parameter remaining granted
        ad_personalization: "denied",
      },
      timestamp: 2000,
    };

    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [defaultEvent] },
      { phase: "REJECT_ALL", events: [rejectUpdateEvent] },
    ]);

    expect(audit.isConsentModeDetected).toBe(true);
    expect(audit.postRejectUserData).toBe("granted");
    expect(audit.issuesDetected).toContain("PDM-R052");
  });

  it("passes cleanly when all parameters are denied on Reject All", () => {
    const defaultEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "default",
      data: {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
      timestamp: 1000,
    };

    const rejectUpdateEvent: RecordedConsentEvent = {
      source: "gtag",
      type: "update",
      data: {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
      timestamp: 2000,
    };

    const audit = parseConsentModeEvents([
      { phase: "NO_CONSENT", events: [defaultEvent] },
      { phase: "REJECT_ALL", events: [rejectUpdateEvent] },
    ]);

    expect(audit.isConsentModeDetected).toBe(true);
    expect(audit.postRejectAdStorage).toBe("denied");
    expect(audit.postRejectAnalytics).toBe("denied");
    expect(audit.postRejectUserData).toBe("denied");
    expect(audit.postRejectPersonalize).toBe("denied");
    expect(audit.issuesDetected).toEqual([]);
  });
});
