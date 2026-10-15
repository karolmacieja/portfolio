import "dotenv/config";

import { Queue, Worker } from "bullmq";

import { getEnv, platformUrl } from "@/lib/env";
import { runDunning } from "@/server/billing/dunning";
import { remoteInvalidate } from "@/server/cache/remote-invalidate";
import { QUEUES, redisConnection, type ThumbnailJob } from "@/server/jobs/queues";
import { createMailer } from "@/server/mail";
import { renderTemplateThumbnail } from "@/server/templates/thumbnail";

/**
 * Background worker (`pnpm worker`). Runs outside Next.js: cache invalidation goes through the
 * app's signed internal endpoint (remoteInvalidate).
 */
const env = getEnv();
const connection = redisConnection();

const thumbnails = new Worker<ThumbnailJob>(
  QUEUES.thumbnails,
  async (job) => {
    const url = await renderTemplateThumbnail(job.data.templateId, job.data.versionId);
    console.info(`[worker] thumbnail ${job.data.templateId} -> ${url}`);
  },
  { connection, concurrency: 1 },
);

const billing = new Worker(
  QUEUES.billing,
  async (job) => {
    if (job.name !== "dunning") return;
    const result = await runDunning({
      invalidate: remoteInvalidate,
      mailer: createMailer(env),
      brand: env.BRAND_NAME,
      billingUrl: platformUrl("app", "/billing"),
    });
    console.info(`[worker] dunning: ${result.reminders} reminders, ${result.suspended} suspended`);
  },
  { connection, concurrency: 1 },
);

// Hourly dunning pass (idempotent scheduler: re-registering on restart doesn't duplicate it).
await new Queue(QUEUES.billing, { connection }).upsertJobScheduler(
  "dunning-hourly",
  { pattern: "7 * * * *" },
  { name: "dunning" },
);

for (const worker of [thumbnails, billing]) {
  worker.on("failed", (job, error) => console.error(`[worker] ${worker.name} job ${job?.id} failed`, error));
}
console.info("[worker] started: thumbnails, billing (dunning hourly)");

async function shutdown() {
  await Promise.all([thumbnails.close(), billing.close()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
