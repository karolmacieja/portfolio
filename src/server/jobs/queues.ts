import { Queue, type ConnectionOptions } from "bullmq";

import { getEnv } from "@/lib/env";

/**
 * Background job queues (BullMQ on Redis). Producers call the `enqueue*` helpers; the worker process
 * (`pnpm worker`, src/worker/index.ts) consumes them.
 */

export const QUEUES = {
  thumbnails: "thumbnails",
  billing: "billing",
  invoices: "invoices",
  domains: "domains",
  newsletter: "newsletter",
} as const;

/** One batch of a campaign; the worker re-enqueues the next batch until nobody is left. */
export type NewsletterJob = { campaignId: string };

export type ThumbnailJob = { templateId: string; versionId: string };
export type InvoiceJob = { invoiceId: string };
/** Domain registration/renewal of an order (the periodic checks are scheduler jobs without data). */
export type DomainJobData = { orderId: string };
export const DOMAIN_JOB_ATTEMPTS = 6;

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

/**
 * Schedules a domain registration or renewal. Registration is deduplicated per order; renewals per
 * order and day. Failures are logged: the worker's maintenance pass re-enqueues stuck orders.
 */
export async function enqueueDomainJob(
  job: { name: "register" | "renew"; orderId: string },
  retryKey?: string,
) {
  const day = new Date().toISOString().slice(0, 10);
  const base =
    job.name === "register" ? `domain-register-${job.orderId}` : `domain-renew-${job.orderId}-${day}`;
  try {
    await getQueue<DomainJobData>(QUEUES.domains).add(
      job.name,
      { orderId: job.orderId },
      {
        jobId: retryKey ? `${base}-${retryKey}` : base,
        attempts: DOMAIN_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  } catch (error) {
    console.error("Failed to enqueue domain job", job, error);
  }
}

/** Starts (or continues) sending a campaign; `delayMs` spaces the batches out. */
export async function enqueueNewsletterBatch(campaignId: string, delayMs = 0): Promise<void> {
  try {
    await getQueue<NewsletterJob>(QUEUES.newsletter).add(
      "batch",
      { campaignId },
      {
        jobId: `newsletter-${campaignId}-${Date.now()}`,
        delay: delayMs,
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  } catch (error) {
    console.error("Failed to enqueue newsletter batch", campaignId, error);
  }
}
