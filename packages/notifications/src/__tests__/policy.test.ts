import { describe, expect, it } from "vitest";
import { meetsSeverity, planDispatch, ruleMatches } from "../policy";
import type { AlertEvent, AlertRuleSpec, RecipientSpec } from "../types";

/**
 * DISPATCH POLICY — §6.6.
 *
 * The acceptance criteria this file stands behind: duplicate suppression within
 * four hours, quiet hours DEFERRING non-critical alerts, and in-app delivery
 * surviving every email-side decision (§12.3, "in-app notifications are
 * unaffected by a Resend outage" — the same independence, proven at the
 * decision layer).
 */

const NIGHT = new Date("2026-01-15T02:00:00Z"); // 02:00 London
const MIDDAY = new Date("2026-01-15T12:00:00Z");

const event: AlertEvent = {
  agencyId: "agency-1",
  type: "CRITICAL_ISSUE",
  severity: "CRITICAL",
  title: "Critical potential issue on example.com",
  body: "A finding at critical severity was detected.",
  linkUrl: "/app/issues/issue-1",
  entityType: "issue",
  entityId: "issue-1",
  websiteId: "site-1",
  websiteGroupId: "group-1",
  clientId: "client-1",
  websiteLabel: "example.com",
};

const rule: AlertRuleSpec = {
  id: "rule-1",
  enabled: true,
  scopeType: "ALL",
  scopeId: null,
  triggerTypes: ["CRITICAL_ISSUE", "NEW_TRACKER"],
  minSeverity: "HIGH",
  channels: ["email", "in_app"],
  digest: "IMMEDIATE",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  criticalOverridesQuietHours: true,
  recipients: [],
};

const recipient: RecipientSpec = {
  userId: "user-1",
  email: "tom@agency.test",
  emailUndeliverable: false,
  websiteScope: [],
  inApp: true,
  email_: true,
  digest: "IMMEDIATE",
};

const context = { now: MIDDAY, timeZone: "Europe/London", lastSentAt: null };

describe("meetsSeverity", () => {
  it("ranks CRITICAL above HIGH above INFO", () => {
    expect(meetsSeverity("CRITICAL", "HIGH")).toBe(true);
    expect(meetsSeverity("HIGH", "HIGH")).toBe(true);
    expect(meetsSeverity("MEDIUM", "HIGH")).toBe(false);
    expect(meetsSeverity("INFO", "INFO")).toBe(true);
  });
});

describe("ruleMatches", () => {
  it("requires enabled, type, severity and scope all to hold", () => {
    expect(ruleMatches(rule, event)).toBe(true);
    expect(ruleMatches({ ...rule, enabled: false }, event)).toBe(false);
    expect(ruleMatches({ ...rule, triggerTypes: ["SCAN_FAILED"] }, event)).toBe(false);
    expect(ruleMatches({ ...rule, minSeverity: "CRITICAL" }, { ...event, severity: "HIGH" })).toBe(
      false,
    );
  });

  it("matches WEBSITE, GROUP and CLIENT scopes on the right id", () => {
    expect(ruleMatches({ ...rule, scopeType: "WEBSITE", scopeId: "site-1" }, event)).toBe(true);
    expect(ruleMatches({ ...rule, scopeType: "WEBSITE", scopeId: "site-2" }, event)).toBe(false);
    expect(ruleMatches({ ...rule, scopeType: "GROUP", scopeId: "group-1" }, event)).toBe(true);
    expect(ruleMatches({ ...rule, scopeType: "CLIENT", scopeId: "client-1" }, event)).toBe(true);
    expect(ruleMatches({ ...rule, scopeType: "CLIENT", scopeId: null }, event)).toBe(false);
  });
});

describe("planDispatch", () => {
  it("produces an in-app row and an immediate email", () => {
    const plan = planDispatch({ event, rules: [rule], recipients: [recipient], context });
    expect(plan.inApp).toHaveLength(1);
    expect(plan.emails).toHaveLength(1);
    expect(plan.emails[0]?.deliverAt).toBeNull();
  });

  it("suppresses everything inside the four-hour duplicate window", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [recipient],
      context: { ...context, lastSentAt: new Date(MIDDAY.getTime() - 60 * 60 * 1000) },
    });
    expect(plan.inApp).toHaveLength(0);
    expect(plan.emails).toHaveLength(0);
    expect(plan.suppressed[0]?.reason).toBe("duplicate_window");
  });

  it("lets an alert through once the window has passed", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [recipient],
      context: { ...context, lastSentAt: new Date(MIDDAY.getTime() - 5 * 60 * 60 * 1000) },
    });
    expect(plan.emails).toHaveLength(1);
  });

  it("defers a non-critical alert inside quiet hours, and never drops it", () => {
    const plan = planDispatch({
      event: { ...event, type: "NEW_TRACKER", severity: "MEDIUM" },
      rules: [{ ...rule, minSeverity: "LOW" }],
      recipients: [recipient],
      context: { ...context, now: NIGHT },
    });
    expect(plan.emails).toHaveLength(1);
    expect(plan.emails[0]?.deferredByQuietHours).toBe(true);
    expect(plan.emails[0]?.deliverAt?.getTime()).toBeGreaterThan(NIGHT.getTime());
  });

  it("lets a CRITICAL alert pierce quiet hours by default", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [recipient],
      context: { ...context, now: NIGHT },
    });
    expect(plan.emails[0]?.deferredByQuietHours).toBe(false);
    expect(plan.emails[0]?.deliverAt).toBeNull();
  });

  it("honours the per-rule opt-out from the critical override", () => {
    const plan = planDispatch({
      event,
      rules: [{ ...rule, criticalOverridesQuietHours: false }],
      recipients: [recipient],
      context: { ...context, now: NIGHT },
    });
    expect(plan.emails[0]?.deferredByQuietHours).toBe(true);
  });

  it("takes the most permissive override when rules disagree", () => {
    const plan = planDispatch({
      event,
      rules: [{ ...rule, id: "quiet", criticalOverridesQuietHours: false }, rule],
      recipients: [recipient],
      context: { ...context, now: NIGHT },
    });
    expect(plan.emails[0]?.deferredByQuietHours).toBe(false);
  });

  it("still writes the in-app row when the recipient has email off", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, email_: false }],
      context,
    });
    expect(plan.inApp).toHaveLength(1);
    expect(plan.emails).toHaveLength(0);
    expect(plan.suppressed[0]?.reason).toBe("recipient_opted_out");
  });

  it("still writes the in-app row for a bounced address", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, emailUndeliverable: true }],
      context,
    });
    expect(plan.inApp).toHaveLength(1);
    expect(plan.emails).toHaveLength(0);
    expect(plan.suppressed[0]?.reason).toBe("email_undeliverable");
  });

  it("holds a DAILY-preference recipient for the digest instead of sending now", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, digest: "DAILY" }],
      context,
    });
    // In-app is ALWAYS immediate (§6.6) even for a digest subscriber.
    expect(plan.inApp).toHaveLength(1);
    expect(plan.emails[0]?.digest).toBe("DAILY");
    expect(plan.emails[0]?.deliverAt).toBeNull();
  });

  it("sends nothing at all to a NEVER recipient", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, digest: "NEVER" }],
      context,
    });
    expect(plan.inApp).toHaveLength(0);
    expect(plan.emails).toHaveLength(0);
  });

  it("skips a member whose website scope excludes the site", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, websiteScope: ["site-9"] }],
      context,
    });
    expect(plan.inApp).toHaveLength(0);
    expect(plan.suppressed[0]?.reason).toBe("out_of_website_scope");
  });

  it("treats an empty website scope as ALL websites", () => {
    const plan = planDispatch({
      event,
      rules: [rule],
      recipients: [{ ...recipient, websiteScope: [] }],
      context,
    });
    expect(plan.inApp).toHaveLength(1);
  });

  it("adds a rule's explicit addresses without duplicating a member's", () => {
    const plan = planDispatch({
      event,
      rules: [{ ...rule, recipients: ["shared@agency.test", "tom@agency.test"] }],
      recipients: [recipient],
      context,
    });
    const addresses = plan.emails.map((e) => e.email).sort();
    expect(addresses).toEqual(["shared@agency.test", "tom@agency.test"]);
  });

  it("records why nothing was sent when no rule matches", () => {
    const plan = planDispatch({
      event,
      rules: [{ ...rule, triggerTypes: ["SCAN_FAILED"] }],
      recipients: [recipient],
      context,
    });
    expect(plan.suppressed).toEqual([{ reason: "no_matching_rule" }]);
  });
});
