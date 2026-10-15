import "dotenv/config";

import { createServer } from "node:http";

import { Queue, Worker } from "bullmq";

import { getEnv, platformUrl } from "@/lib/env";
import { runDunning } from "@/server/billing/dunning";
import { remoteInvalidate } from "@/server/cache/remote-invalidate";
import { createInvoicingProvider } from "@/server/invoicing";
import {
  issueInvoice,
  stalePendingInvoices,
  syncKsefStates,
  type InvoicingDeps,
} from "@/server/invoicing/service";
import {
  enqueueInvoice,
  INVOICE_JOB_ATTEMPTS,
  QUEUES,
  redisConnection,
  type InvoiceJob,
  type ThumbnailJob,
} from "@/server/jobs/queues";
import { createMailer } from "@/server/mail";
import { renderTemplateThumbnail } from "@/server/templates/thumbnail";

/**
 * Background worker (`pnpm worker`). Runs outside Next.js: cache invalidation goes through the
 * app's signed internal endpoint (remoteInvalidate).
 */
const env = getEnv();
const connection = redisConnection();
const mailer = createMailer(env);
const billingUrl = platformUrl("app", "/billing");
const invoicing: InvoicingDeps = {
  provider: createInvoicingProvider(env),
  mailer,
  brand: env.BRAND_NAME,
  billingUrl,
};

const thumbnails = new Worker<ThumbnailJob>(
  QUEUES.thumbnails,
  async (job) => {
    const url = await renderTemplateThumbnail(job.data.templateId, job.data.versionId);
    console.info(`[worker] thumbnail ${job.data.templateId} -> ${url ?? "skipped (template deleted)"}`);
  },
  { connection, concurrency: 1 },
);

const billing = new Worker(
  QUEUES.billing,
  async (job) => {
    if (job.name !== "dunning") return;
    const result = await runDunning({
      invalidate: remoteInvalidate,
      mailer,
      brand: env.BRAND_NAME,
      billingUrl,
      enqueueInvoice,
    });
    console.info(`[worker] dunning: ${result.reminders} reminders, ${result.suspended} suspended`);
  },
  { connection, concurrency: 1 },
);

// Concurrency 1: an invoice re-enqueued by the sweep never runs in parallel with its own retry.
const invoices = new Worker<InvoiceJob>(
  QUEUES.invoices,
  async (job) => {
    if (job.name === "issue") {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? INVOICE_JOB_ATTEMPTS);
      await issueInvoice(job.data.invoiceId, invoicing, { final });
      return;
    }
    if (job.name === "sweep") {
      for (const invoice of await stalePendingInvoices()) {
        await enqueueInvoice(invoice.id, String(invoice.updatedAt.getTime()));
      }
      const updated = await syncKsefStates(invoicing);
      if (updated) console.info(`[worker] KSeF: ${updated} invoice status(es) updated`);
    }
  },
  { connection, concurrency: 1 },
);

// Schedulers are idempotent: re-registering on restart doesn't duplicate them.
await new Queue(QUEUES.billing, { connection }).upsertJobScheduler(
  "dunning-hourly",
  { pattern: "7 * * * *" },
  { name: "dunning" },
);
await new Queue(QUEUES.invoices, { connection }).upsertJobScheduler(
  "invoices-sweep",
  { every: 5 * 60_000 },
  { name: "sweep" },
);

for (const worker of [thumbnails, billing, invoices]) {
  worker.on("failed", (job, error) => console.error(`[worker] ${worker.name} job ${job?.id} failed`, error));
}

// Optional health endpoint for container orchestration (Coolify/Docker healthchecks).
const health = env.WORKER_HEALTH_PORT
  ? createServer((request, response) => {
      const ok = request.url === "/health" && [thumbnails, billing, invoices].every((w) => w.isRunning());
      response.writeHead(ok ? 200 : request.url === "/health" ? 503 : 404).end(ok ? "ok" : "");
    }).listen(env.WORKER_HEALTH_PORT)
  : null;
console.info(
  `[worker] started: thumbnails, billing (dunning hourly), invoices (sweep + KSeF every 5 min)` +
    (health ? `; health on :${env.WORKER_HEALTH_PORT}/health` : ""),
);

async function shutdown() {
  health?.close();
  await Promise.all([thumbnails.close(), billing.close(), invoices.close()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
