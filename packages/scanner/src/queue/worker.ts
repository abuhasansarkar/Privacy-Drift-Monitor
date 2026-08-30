import { Worker, type Job, type Processor } from "bullmq";
import type IORedis from "ioredis";
import { QUEUE_NAMES, type ScanJobData } from "./queues";

/**
 * SCAN WORKER FACTORY — §7.2.
 *
 * ⚠️ THE WORKER PROCESS DOES NOT IMPORT BULLMQ OR IOREDIS DIRECTLY, and that is
 * structural rather than stylistic. With both `worker/` and this package
 * declaring them, npm installed a second nested copy and the two `Redis` types
 * stopped being assignable to each other — a build failure that says nothing
 * about the code. One package owns the queue contract; everything else consumes
 * it through here.
 */

export interface ScanWorkerOptions {
  connection: IORedis;
  concurrency: number;
}

export function createScanWorker<TResult>(
  processor: Processor<ScanJobData, TResult>,
  options: ScanWorkerOptions,
): Worker<ScanJobData, TResult> {
  return new Worker<ScanJobData, TResult>(QUEUE_NAMES.scan, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

export type { Job, Worker };
