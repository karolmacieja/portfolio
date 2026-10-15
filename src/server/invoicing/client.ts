import "server-only";

import { InvoiceStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** Client-facing invoice reads (owner-scoped by userId). Only issued invoices are visible. */

export async function listUserInvoices(userId: string) {
  return db.invoice.findMany({
    where: { userId, status: InvoiceStatus.ISSUED },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      number: true,
      issueDate: true,
      grossAmount: true,
      currency: true,
      ksefStatus: true,
      ksefNumber: true,
      correctedInvoice: { select: { number: true } },
    },
    take: 100,
  });
}

/** The PDF of an issued invoice; `asStaff` skips the owner check (staff only, not owner-scoped). */
export async function getInvoicePdf(invoiceId: string, viewer: { userId: string; asStaff?: boolean }) {
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      status: InvoiceStatus.ISSUED,
      ...(viewer.asStaff ? {} : { userId: viewer.userId }),
    },
    select: { number: true, document: { select: { content: true } } },
  });
  if (!invoice?.number || !invoice.document) return null;
  return { number: invoice.number, content: Buffer.from(invoice.document.content) };
}
