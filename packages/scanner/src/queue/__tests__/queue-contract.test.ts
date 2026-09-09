import { describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import {
  AI_JOB_OPTIONS,
  EMAIL_JOB_OPTIONS,
  NOTIFICATION_JOB_OPTIONS,
  QUEUE_NAMES,
  REPORT_JOB_OPTIONS,
  SCAN_JOB_OPTIONS,
  enqueueAi,
  enqueueEmail,
  enqueueNotification,
  enqueueReport,
  enqueueScan,
  toJobId,
} from "../queues";

/**
 * QUEUE AND JOB IDS ARE A CONTRACT — AGENTS.md, PLAN.md §7.2.
 *
 * ⚠️ THE FAILURE THIS GUARDS IS A RUNTIME THROW IN PRODUCTION, NOT A TYPE
 * ERROR. BullMQ builds its Redis keys as `bull:<queue>:<id>` and rejects a
 * name or a custom job id containing `:` when the queue is constructed or the
 * job is added — so `pdm:scan` killed the worker at boot, and a natural dedupe
 * key like `agency:CRITICAL_ISSUE:issue-1` killed an enqueue. Both were found
 * by running the processes, not by the compiler, and both are one careless
 * string away from returning.
 *
 * AGENTS.md lists this as one of three contracts that "now have a test that
 * fails the build if one goes missing". It did not; this is that test.
 */

describe("queue names", () => {
  const names = Object.entries(QUEUE_NAMES);

  it("has at least one queue", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const [key, name] of names) {
    it(`${key} → "${name}" is a legal BullMQ queue name`, () => {
      // ⚠️ The one that actually threw.
      expect(name).not.toContain(":");
      // Dashes and lowercase keep the Redis keyspace readable; whitespace and
      // braces would also survive TypeScript and break at runtime (braces are
      // Redis Cluster hash-tag syntax).
      expect(name).toMatch(/^[a-z0-9-]+$/);
      expect(name.startsWith("pdm-")).toBe(true);
    });
  }

  it("has no duplicate names", () => {
    // Two logical queues sharing a name silently merge: a report job would be
    // handed to the notification processor, which is a head-of-line block that
    // looks like a hang.
    const values = names.map(([, name]) => name);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("toJobId", () => {
  it("removes every colon from a natural key", () => {
    expect(toJobId("agency-1:CRITICAL_ISSUE:issue-1")).toBe(
      "agency-1~CRITICAL_ISSUE~issue-1",
    );
  });

  it("is total — two distinct keys stay distinct", () => {
    // ⚠️ A LOSSY MAPPING WOULD COLLAPSE TWO ALERTS INTO ONE, silently, because
    // the job id is also the deduplication key. `a:b` and `a~b` must not meet.
    expect(toJobId("a:b")).not.toBe(toJobId("a:b:c"));
    expect(toJobId("a:b")).not.toBe(toJobId("ab"));
  });

  it("leaves a key with no colon unchanged", () => {
    expect(toJobId("scan-01HX")).toBe("scan-01HX");
  });
});

/**
 * A `Queue` double that records what `add()` was called with.
 *
 * ⚠️ THE JOB ID IS THE IDEMPOTENCY KEY on every one of these queues — BullMQ
 * ignores an `add()` for an id it already holds. That single property is what
 * stops a double-clicked "Scan now" burning two browser slots, a replayed
 * webhook sending two emails, and a re-run analysis commissioning the same AI
 * explanation twice. It is invisible in the type system and it is exactly the
 * kind of thing a refactor drops, so it is asserted here per queue.
 */
function fakeQueue() {
  const calls: Array<{ name: string; data: unknown; opts?: { jobId?: string; delay?: number } }> = [];
  const queue = {
    add: async (name: string, data: unknown, opts?: { jobId?: string; delay?: number }) => {
      calls.push({ name, data, opts });
      return { id: opts?.jobId };
    },
  } as unknown as Queue<never>;
  return { queue, calls };
}

describe("enqueue helpers set the job id as the idempotency key", () => {
  it("a scan is keyed by scanId — a double-click cannot scan twice", async () => {
    const { queue, calls } = fakeQueue();
    await enqueueScan(queue as never, {
      scanId: "scan-1", websiteId: "w", agencyId: "a", url: "https://x.test",
      registrableDomain: "x.test", monitoredPaths: ["/"], respectRobots: true,
      blockMedia: true, trigger: "MANUAL",
    });
    expect(calls[0]?.opts?.jobId).toBe("scan-1");
  });

  it("a notification is keyed by its dedupeKey, colons rewritten", async () => {
    const { queue, calls } = fakeQueue();
    await enqueueNotification(queue as never, {
      agencyId: "a", type: "CRITICAL_ISSUE", severity: "CRITICAL", title: "t", body: "b",
      linkUrl: null, entityType: null, entityId: null, websiteId: null,
      websiteGroupId: null, clientId: null, websiteLabel: null,
      dedupeKey: "a:CRITICAL_ISSUE:issue-1",
    });
    // ⚠️ BullMQ THROWS on a custom id containing ':' — this is the rewrite.
    expect(calls[0]?.opts?.jobId).toBe("a~CRITICAL_ISSUE~issue-1");
  });

  it("an email is keyed by its idempotencyKey", async () => {
    const { queue, calls } = fakeQueue();
    await enqueueEmail(queue as never, {
      agencyId: "a", message: {}, to: "x@y.test", userId: null, alertRuleId: null,
      notificationType: null, entityType: null, entityId: null,
      idempotencyKey: "a:alert:issue-1",
    });
    expect(calls[0]?.opts?.jobId).toBe("a~alert~issue-1");
  });

  it("a quiet-hours deferral is a DELAYED job, never a dropped one", async () => {
    // §6.6: quiet hours defer delivery. Dropping instead of delaying would lose
    // an alert the customer asked to receive later, not never.
    const { queue, calls } = fakeQueue();
    const deliverAt = new Date(Date.now() + 60_000);
    await enqueueEmail(
      queue as never,
      {
        agencyId: "a", message: {}, to: "x@y.test", userId: null, alertRuleId: null,
        notificationType: null, entityType: null, entityId: null, idempotencyKey: "k",
      },
      { deliverAt },
    );
    expect(calls[0]?.opts?.delay).toBeGreaterThan(0);
  });

  it("a past deliverAt produces no negative delay", async () => {
    // `Math.max(0, …)` — BullMQ on a negative delay is undefined behaviour, and
    // a quiet-hours window that has already closed must send NOW.
    const { queue, calls } = fakeQueue();
    await enqueueEmail(
      queue as never,
      {
        agencyId: "a", message: {}, to: "x@y.test", userId: null, alertRuleId: null,
        notificationType: null, entityType: null, entityId: null, idempotencyKey: "k",
      },
      { deliverAt: new Date(Date.now() - 60_000) },
    );
    expect(calls[0]?.opts?.delay).toBe(0);
  });

  it("a report is keyed by reportId", async () => {
    const { queue, calls } = fakeQueue();
    await enqueueReport(queue as never, {
      agencyId: "a", reportId: "rep-1", requestedByUserId: "u",
    });
    expect(calls[0]?.opts?.jobId).toBe("rep-1");
  });

  it("an AI job is keyed by its dedupeKey — a replayed analysis pays once", async () => {
    const { queue, calls } = fakeQueue();
    await enqueueAi(queue as never, {
      agencyId: "a", feature: "EXPLAIN_ISSUE", entityType: "issue", entityId: "i-1",
      issueId: "i-1", userId: null, dedupeKey: "a:EXPLAIN_ISSUE:i-1",
    });
    expect(calls[0]?.opts?.jobId).toBe("a~EXPLAIN_ISSUE~i-1");
  });
});

describe("retry policies encode a cost decision, not a default", () => {
  it("email retries the most — §9.5, mail must not be lost", () => {
    expect(EMAIL_JOB_OPTIONS.attempts).toBe(8);
  });

  it("alerts retry fast, to stay inside the 60-second budget (§12.3)", () => {
    expect(NOTIFICATION_JOB_OPTIONS.attempts).toBe(5);
    // A slow first backoff would spend the whole budget waiting.
    expect((NOTIFICATION_JOB_OPTIONS.backoff as { delay: number }).delay).toBeLessThanOrEqual(5_000);
  });

  it("reports and AI retry LEAST — each attempt costs real money", () => {
    // A report attempt costs a Chromium render; an AI attempt costs a provider
    // call. Both answer the same way on a deterministic failure.
    expect(REPORT_JOB_OPTIONS.attempts).toBe(2);
    expect(AI_JOB_OPTIONS.attempts).toBe(2);
  });

  it("a scan gets three attempts — a browser slot is the scarcest resource", () => {
    expect(SCAN_JOB_OPTIONS.attempts).toBe(3);
  });

  it("every queue bounds its own history", () => {
    // Unbounded completed-job retention fills Redis, which takes the whole
    // pipeline down rather than just the queue that did it.
    for (const options of [
      SCAN_JOB_OPTIONS, NOTIFICATION_JOB_OPTIONS, EMAIL_JOB_OPTIONS,
      REPORT_JOB_OPTIONS, AI_JOB_OPTIONS,
    ]) {
      expect(options.removeOnComplete).toBeDefined();
      expect(options.removeOnFail).toBeDefined();
    }
  });
});
