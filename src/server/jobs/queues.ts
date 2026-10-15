import { Queue, type ConnectionOptions } from "bullmq";

import { getEnv } from "@/lib/env";

/**
 * Background job queues (BullMQ on Redis). Producers call the `enqueue*` helpers; the worker process
 * (`pnpm worker`, src/worker/index.ts) consumes them.
 */

export const QUEUES = { thumbnails: "thumbnails", billing: "billing", invoices: "invoices" } as const;

export type ThumbnailJob = { templateId: string; versionId: string };
export type InvoiceJob = { invoiceId: string };

/** Issuing retries: 30s, 1m, 2m, 4m, 8m (stays below the 10-minute stale sweep). */
export const INVOICE_JOB_ATTEMPTS = 6;

export function redisConnection(): ConnectionOptions {
  // BullMQ workers need maxRetriesPerRequest = null for blocking commands.
  return { url: getEnv().REDIS_URL, maxRetriesPerRequest: null };
}

const globalForQueues = globalThis as unknown as { queues?: Map<string, Queue> };

function getQueue<T>(name: string): Queue<T> {
  globalForQueues.queues ??= new Map();
  let queue = globalForQueues.queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redisConnection() });
    globalForQueues.queues.set(name, queue);
  }
  return queue as Queue<T>;
}

/** Schedules a thumbnail render for a template version. Failures are logged, never thrown to the caller. */
export async function enqueueThumbnail(job: ThumbnailJob): Promise<void> {
  try {
    await getQueue<ThumbnailJob>(QUEUES.thumbnails).add("render", job, {
      jobId: `thumb-${job.versionId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch (error) {
    console.error("Failed to enqueue thumbnail job", job, error);
  }
}

/**
 * Schedules issuing of an invoice. The job id dedupes repeated events; pass a `retryKey` to run an
 * invoice again (admin retry, stale sweep). Failures are logged: the worker's sweep re-enqueues.
 */
export async function enqueueInvoice(invoiceId: string, retryKey?: string): Promise<void> {
  try {
    await getQueue<InvoiceJob>(QUEUES.invoices).add(
      "issue",
      { invoiceId },
      {
        jobId: retryKey ? `invoice-${invoiceId}-${retryKey}` : `invoice-${invoiceId}`,
        attempts: INVOICE_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  } catch (error) {
    console.error("Failed to enqueue invoice job", invoiceId, error);
  }
}
