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
  now?: () => Date;
};
