import { describe, expect, it } from "vitest";
import { screenshotKey, shouldCapture } from "../screenshots";

/**
 * SCREENSHOT POLICY AND S3 KEYS — PLAN.md Part IV §4.5, §5.7, §10.6,
 * Phase 2 tasks 2.3 / 2.12.
 *
 * ⚠️ THE KEY LAYOUT IS A TENANCY AND RETENTION CONTROL, not a naming choice.
 * §5.7 makes it agency-first so that deleting an agency, or running a retention
 * sweep, is a single prefix operation — and so a mis-scoped signed URL is
 * obvious in a log line instead of invisible. A key that stopped starting with
 * `agencies/<id>/` would leave objects behind on tenant deletion (a data
 * -minimisation obligation, §10.6) and nothing would fail loudly.
 *
 * The file was at 34% coverage with both of these untested.
 */

describe("screenshotKey — §5.7 agency-first layout", () => {
  const key = screenshotKey({
    agencyId: "agency-1",
    websiteId: "site-2",
    scanId: "scan-3",
    phase: "NO_CONSENT",
    kind: "banner-initial",
  });

  it("builds the full documented path", () => {
    expect(key).toBe(
      "agencies/agency-1/websites/site-2/scans/scan-3/NO_CONSENT-banner-initial.png",
    );
  });

  it("starts with the agency prefix — the deletion and sweep handle", () => {
    // ⚠️ The one assertion that matters. Everything else about this key is
    // convenience; this is what makes tenant deletion complete.
    expect(key.startsWith("agencies/agency-1/")).toBe(true);
  });

  it("nests the website inside the agency, never beside it", () => {
    // A flat `websites/<id>/…` layout would make an agency sweep a scan of
    // every object rather than a prefix delete.
    expect(key.indexOf("agencies/")).toBeLessThan(key.indexOf("websites/"));
    expect(key.indexOf("websites/")).toBeLessThan(key.indexOf("scans/"));
  });

  it("distinguishes the four consent phases within one scan", () => {
    /*
     * ⚠️ WITHOUT THE PHASE IN THE FILENAME, ALL FOUR JOURNEYS OVERWRITE EACH
     * OTHER. The product's entire claim is that behaviour differs by consent
     * state; a single screenshot per scan would show one journey and silently
     * present it as all of them.
     */
    const keys = (["NO_CONSENT", "REJECT_ALL", "ACCEPT_ALL", "WITHDRAW"] as const).map(
      (phase) =>
        screenshotKey({
          agencyId: "a",
          websiteId: "w",
          scanId: "s",
          phase,
          kind: "banner-initial",
        }),
    );
    expect(new Set(keys).size).toBe(4);
  });

  it("distinguishes kinds within one phase", () => {
    const bannerInitial = screenshotKey({
      agencyId: "a", websiteId: "w", scanId: "s", phase: "NO_CONSENT", kind: "banner-initial",
    });
    const fullPage = screenshotKey({
      agencyId: "a", websiteId: "w", scanId: "s", phase: "NO_CONSENT", kind: "full-page",
    });
    expect(bannerInitial).not.toBe(fullPage);
  });

  it("keeps two scans of the same website apart", () => {
    // Evidence is immutable per scan (§5). Colliding keys would mean today's
    // screenshot silently replacing the one an open finding cites.
    const first = screenshotKey({
      agencyId: "a", websiteId: "w", scanId: "scan-1", phase: "NO_CONSENT", kind: "banner-initial",
    });
    const second = screenshotKey({
      agencyId: "a", websiteId: "w", scanId: "scan-2", phase: "NO_CONSENT", kind: "banner-initial",
    });
    expect(first).not.toBe(second);
  });

  it("is a relative key with no leading slash", () => {
    // A leading slash produces an S3 object whose name begins with an empty
    // path segment — it stores fine and never matches the sweep prefix.
    expect(key.startsWith("/")).toBe(false);
  });
});

describe("shouldCapture — §4.5 storage policy", () => {
  it("NEVER captures nothing, whatever changed", () => {
    expect(shouldCapture({ policy: "NEVER", changed: true })).toBe(false);
  });

  it("ALWAYS captures even when nothing changed", () => {
    expect(shouldCapture({ policy: "ALWAYS", changed: false })).toBe(true);
  });

  it("ON_CHANGE — the default — captures only on a change", () => {
    // This is the setting that keeps storage proportional to what actually
    // changed rather than to how often we look. A full-page PNG × four
    // journeys × a daily scan is gigabytes per site per year.
    expect(shouldCapture({ policy: "ON_CHANGE", changed: true })).toBe(true);
    expect(shouldCapture({ policy: "ON_CHANGE", changed: false })).toBe(false);
  });

  it("ON_CHANGE with an UNKNOWN change state does not capture", () => {
    /*
     * ⚠️ `changed === true`, not `changed !== false`. On the first scan of a
     * site there is nothing to compare against, so `changed` is undefined — and
     * the safe reading is "no known change", not "capture everything". The
     * looser test would make every first scan behave like ALWAYS, which is the
     * exact cost this policy exists to avoid.
     */
    expect(shouldCapture({ policy: "ON_CHANGE" })).toBe(false);
  });
});
