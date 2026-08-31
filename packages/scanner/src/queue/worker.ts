import { Worker, type Job, type Processor } from "bullmq";
import type IORedis from "ioredis";
import {
  QUEUE_NAMES,
  type AiJobData,
  type DigestJobData,
  type EmailJobData,
  type NotificationJobData,
  type ReportJobData,
  type ScanJobData,
} from "./queues";

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

/* ──────────────────── Phase 4 worker factories (§7.2) ────────────────────
 *
 * Same rule as `createScanWorker`: the worker process never imports bullmq or
 * ioredis directly, so there is exactly one copy of the queue contract.
 *
 * ⚠️ CONCURRENCIES DIFFER ON PURPOSE. Notification and email work is I/O-bound
 * and cheap, so it runs wide. A report render owns a Chromium page and is the
 * expensive one — running it wide is how a report backlog eats the memory the
 * scan pool needs (§6.8).
 */

export interface QueueWorkerOptions {
  connection: IORedis;
  concurrency: number;
}

export function createNotificationWorker<TResult>(
  processor: Processor<NotificationJobData, TResult>,
  options: QueueWorkerOptions,
): Worker<NotificationJobData, TResult> {
  return new Worker<NotificationJobData, TResult>(QUEUE_NAMES.notification, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

export function createEmailWorker<TResult>(
  processor: Processor<EmailJobData, TResult>,
  options: QueueWorkerOptions,
): Worker<EmailJobData, TResult> {
  return new Worker<EmailJobData, TResult>(QUEUE_NAMES.email, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

export function createReportWorker<TResult>(
  processor: Processor<ReportJobData, TResult>,
  options: QueueWorkerOptions,
): Worker<ReportJobData, TResult> {
  return new Worker<ReportJobData, TResult>(QUEUE_NAMES.report, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

export function createDigestWorker<TResult>(
  processor: Processor<DigestJobData, TResult>,
  options: QueueWorkerOptions,
): Worker<DigestJobData, TResult> {
  return new Worker<DigestJobData, TResult>(QUEUE_NAMES.digest, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

/**
 * §7.2: concurrency 5.
 *
 * ⚠️ FIVE, NOT TWENTY, EVEN THOUGH THE WORK IS PURE I/O. The constraint is the
 * PROVIDER's rate limit, not ours — running this as wide as the email worker
 * would turn a burst of auto-explains into a wall of 429s, each one a retry,
 * each retry another request against the same limit. The queue is also the only
 * one whose backlog costs money to drain.
 */
export function createAiWorker<TResult>(
  processor: Processor<AiJobData, TResult>,
  options: QueueWorkerOptions,
): Worker<AiJobData, TResult> {
  return new Worker<AiJobData, TResult>(QUEUE_NAMES.ai, processor, {
    connection: options.connection,
    concurrency: options.concurrency,
  });
}

export type { Job, Worker };
