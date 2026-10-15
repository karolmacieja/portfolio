import { Queue, type ConnectionOptions } from "bullmq";

import { getEnv } from "@/lib/env";

/**
 * Background job queues (BullMQ on Redis). Producers call the `enqueue*` helpers; the worker process
 * (`pnpm worker`, src/worker/index.ts) consumes them.
 */

export const QUEUES = { thumbnails: "thumbnails", billing: "billing" } as const;

export type ThumbnailJob = { templateId: string; versionId: string };

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
