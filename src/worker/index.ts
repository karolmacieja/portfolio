import "dotenv/config";

import { Worker } from "bullmq";

import { QUEUES, redisConnection, type ThumbnailJob } from "@/server/jobs/queues";
import { renderTemplateThumbnail } from "@/server/templates/thumbnail";

/**
 * Background worker (`pnpm worker`). Runs outside Next.js, so cache invalidation that needs Next
 * (revalidateTag) is not available here; thumbnails are not part of cached pages.
 */
const thumbnails = new Worker<ThumbnailJob>(
  QUEUES.thumbnails,
  async (job) => {
    const url = await renderTemplateThumbnail(job.data.templateId, job.data.versionId);
    console.info(`[worker] thumbnail ${job.data.templateId} -> ${url}`);
  },
  { connection: redisConnection(), concurrency: 1 },
);

thumbnails.on("failed", (job, error) => console.error(`[worker] thumbnail job ${job?.id} failed`, error));
console.info("[worker] started: thumbnails");

async function shutdown() {
  await thumbnails.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
