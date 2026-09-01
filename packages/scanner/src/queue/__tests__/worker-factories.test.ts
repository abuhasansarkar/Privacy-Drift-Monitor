import { beforeEach, describe, expect, it, vi } from "vitest";
import type IORedis from "ioredis";

/**
 * WORKER FACTORIES — PLAN.md Part VII §7.2, Phase 2 task 2.1.
 *
 * ⚠️ THE FAILURE THESE GUARD AGAINST IS A WORKER THAT LOOKS ALIVE AND PROCESSES
 * NOTHING. A factory pointed at the wrong queue name starts cleanly, reports
 * healthy, logs nothing, and consumes zero jobs — the queue just grows. This
 * codebase has already met that shape once (`maxRetriesPerRequest` silently
 * ending the blocking read), and it is invisible to types: every one of these
 * takes a `string` and BullMQ accepts any string happily.
 *
 * ⚠️ `bullmq` IS MOCKED, DELIBERATELY. Constructing a real `Worker` opens a
 * blocking Redis connection per call, so six of them in a unit test would leave
 * six sockets open and make the suite depend on Redis being up. What is being
 * asserted here is the WIRING — which queue, which concurrency — and that is
 * fully visible at the constructor boundary.
 */

const constructed: Array<{ queue: string; opts: { concurrency?: number } }> = [];

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(queue: string, _processor: unknown, opts: { concurrency?: number }) {
      constructed.push({ queue, opts });
    }
  },
  Queue: class {},
}));

const { QUEUE_NAMES } = await import("../queues");
const {
  createAiWorker,
  createDigestWorker,
  createEmailWorker,
  createNotificationWorker,
  createReportWorker,
  createScanWorker,
} = await import("../worker");

const connection = {} as IORedis;
const processor = async () => undefined;

beforeEach(() => {
  constructed.length = 0;
});

describe("each factory binds to its OWN queue", () => {
  const cases = [
    ["scan", createScanWorker, QUEUE_NAMES.scan],
    ["notification", createNotificationWorker, QUEUE_NAMES.notification],
    ["email", createEmailWorker, QUEUE_NAMES.email],
    ["report", createReportWorker, QUEUE_NAMES.report],
    ["digest", createDigestWorker, QUEUE_NAMES.digest],
    ["ai", createAiWorker, QUEUE_NAMES.ai],
  ] as const;

  for (const [label, factory, expected] of cases) {
    it(`${label} consumes "${expected}"`, () => {
      (factory as (p: unknown, o: unknown) => unknown)(processor, {
        connection,
        concurrency: 1,
      });
      expect(constructed[0]?.queue).toBe(expected);
    });
  }

  it("no two factories bind to the same queue", () => {
    // Two workers on one queue is not an error BullMQ reports — they just
    // steal each other's jobs, and the queue nobody is reading grows forever.
    for (const [, factory] of cases) {
      (factory as (p: unknown, o: unknown) => unknown)(processor, {
        connection,
        concurrency: 1,
      });
    }
    const names = constructed.map((c) => c.queue);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("concurrency is passed through, because it is a resource decision", () => {
  it("the caller's concurrency reaches BullMQ", () => {
    /*
     * ⚠️ §7.2 fixes a different number per queue for a different reason —
     * scan concurrency is bounded by RAM (each is a Chromium context), report
     * by the same, AI by the PROVIDER's rate limit, email and notifications by
     * nothing much. A factory that ignored the argument and defaulted to 1
     * would quietly serialise the whole pipeline; one that defaulted high would
     * exhaust memory on the scan queue.
     */
    createScanWorker(processor, { connection, concurrency: 2 });
    createEmailWorker(processor as never, { connection, concurrency: 20 });
    createAiWorker(processor as never, { connection, concurrency: 5 });

    expect(constructed.map((c) => c.opts.concurrency)).toEqual([2, 20, 5]);
  });
});
