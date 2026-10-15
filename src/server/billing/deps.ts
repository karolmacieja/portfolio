import type { DomainJob } from "@/server/domains/billing";
import type { Mailer } from "@/server/mail/types";

/**
 * Side effects of billing logic, injected so the same code runs inside Next.js (revalidateTag),
 * in the worker (remote invalidation) and in tests (spies).
 */
export type BillingDeps = {
  invalidate: (tags: string[]) => Promise<void> | void;
  mailer: Mailer;
  brand: string;
  /** Absolute URL of the client billing page (links in emails). */
  billingUrl: string;
  /** Hands an invoice to the worker (BullMQ); a periodic sweep picks up anything that was lost. */
  enqueueInvoice: (invoiceId: string) => Promise<void> | void;
  /** Hands a domain registration/renewal to the worker. */
  enqueueDomainJob: (job: DomainJob) => Promise<void> | void;
  now?: () => Date;
};
