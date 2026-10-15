import "server-only";

import { InvoiceStatus, KsefStatus, type InvoiceKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { enqueueInvoice } from "@/server/jobs/queues";

import { createInvoicingProvider } from "./index";
import { buyerFromSnapshot } from "./service";

/** Staff operations on invoices (not owner-scoped): listing, manual retry, KSeF resend. */

export type InvoiceFilter = {
  status?: InvoiceStatus;
  ksef?: KsefStatus;
  kind?: InvoiceKind;
  /** Invoice number or the buyer's email. */
  q?: string;
};

export async function listInvoices(filter: InvoiceFilter = {}, take = 100) {
  const where: Prisma.InvoiceWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.ksef ? { ksefStatus: filter.ksef } : {}),
    ...(filter.kind ? { kind: filter.kind } : {}),
    ...(filter.q
      ? {
          OR: [
            { number: { contains: filter.q, mode: "insensitive" } },
            { user: { email: { contains: filter.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  return db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      number: true,
      issueDate: true,
      createdAt: true,
      grossAmount: true,
      currency: true,
      vatRate: true,
      reverseCharge: true,
      ksefStatus: true,
      ksefNumber: true,
      ksefError: true,
      attempts: true,
      lastError: true,
      emailedAt: true,
      user: { select: { email: true } },
      correctedInvoice: { select: { number: true } },
    },
  });
}

/** Counts for the "needs attention" badges. */
export async function invoiceAttentionCounts() {
  const [failed, ksefErrors] = await Promise.all([
    db.invoice.count({ where: { status: InvoiceStatus.FAILED } }),
    db.invoice.count({ where: { ksefStatus: KsefStatus.ERROR } }),
  ]);
  return { failed, ksefErrors };
}

/**
 * Puts a FAILED invoice back into the queue. Not yet issued invoices take the buyer's current billing
 * profile, so fixing the client's data (e.g. a NIP rejected by KSeF) and retrying is enough.
 */
export async function retryInvoice(invoiceId: string): Promise<boolean> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { user: { select: { name: true, email: true, billingProfile: true } } },
  });
  if (!invoice || invoice.status !== InvoiceStatus.FAILED) return false;
  const profile = invoice.user.billingProfile;
  const buyer =
    !invoice.providerInvoiceId && profile
      ? buyerFromSnapshot(profile, {
          name: invoice.user.name ?? invoice.user.email,
          email: invoice.user.email,
        })
      : undefined;
  const updated = await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status: invoice.providerInvoiceId ? InvoiceStatus.ISSUED : InvoiceStatus.PENDING,
      attempts: 0,
      lastError: null,
      ...(buyer ? { buyer } : {}),
    },
  });
  await enqueueInvoice(invoiceId, String(updated.updatedAt.getTime()));
  return true;
}

/** Sends an issued invoice to KSeF again after a KSeF error. */
export async function resendInvoiceToKsef(invoiceId: string): Promise<boolean> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice?.providerInvoiceId || invoice.status !== InvoiceStatus.ISSUED) return false;
  if (invoice.ksefStatus === KsefStatus.ACCEPTED) return false;
  const state = await createInvoicingProvider(getEnv()).resendToKsef(invoice.providerInvoiceId);
  await db.invoice.update({
    where: { id: invoiceId },
    data: { ksefStatus: state.status, ksefNumber: state.number, ksefError: state.error },
  });
  return true;
}
