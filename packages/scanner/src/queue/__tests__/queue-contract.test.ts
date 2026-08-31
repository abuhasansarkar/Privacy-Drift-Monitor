import { describe, expect, it } from "vitest";
import { QUEUE_NAMES, toJobId } from "../queues";

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
