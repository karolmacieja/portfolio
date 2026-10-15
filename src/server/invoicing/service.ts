import { isLocale } from "@/i18n/config";
import {
  BillingInterval,
  InvoiceKind,
  InvoiceStatus,
  KsefStatus,
  PaymentKind,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Mailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";

import { splitGross } from "./amounts";
import { EXEMPTION_113, getInvoicingSettings, type InvoicingSettings } from "./settings";
import {
  InvoicingProviderError,
  type InvoiceInput,
  type InvoiceLine,
  type InvoiceParty,
  type InvoicingProvider,
  type KsefState,
  type VatRate,
} from "./types";

/**
 * Invoice lifecycle. Billing events create PENDING invoice rows (idempotent per payment/refund
 * total) and enqueue them; the worker issues them at the provider, stores the PDF and mails it.
 * Every step is resumable, so a retried job continues where the previous attempt stopped.
 */

export type InvoicingDeps = {
  provider: InvoicingProvider;
  mailer: Mailer;
  brand: string;
  billingUrl: string;
  now?: () => Date;
};

type BillingSnapshot = {
  type?: "PERSON" | "COMPANY";
  fullName?: string;
  companyName?: string | null;
  taxId?: string | null;
  euVatId?: string | null;
  reverseCharge?: boolean;
  line1?: string;
  line2?: string | null;
  postalCode?: string;
  city?: string;
  country?: string;
};

export function buyerFromSnapshot(
  snapshot: BillingSnapshot | null,
  fallback: { name: string; email: string },
): InvoiceParty {
  const company = snapshot?.type === "COMPANY";
  const taxId = snapshot?.taxId ?? snapshot?.euVatId ?? null;
  return {
    company,
    name: (company ? snapshot?.companyName : snapshot?.fullName) || fallback.name,
    taxId: company ? taxId : null,
    taxIdKind: company && snapshot?.taxId ? "nip" : company && snapshot?.euVatId ? "eu" : "none",
    street: [snapshot?.line1, snapshot?.line2].filter(Boolean).join(", "),
    postalCode: snapshot?.postalCode ?? "",
    city: snapshot?.city ?? "",
    country: snapshot?.country ?? "PL",
    email: fallback.email,
  };
}

export function sellerFromSettings(settings: InvoicingSettings): InvoiceParty & { bankAccount: string } {
  const { seller } = settings;
  return {
    company: true,
    name: seller.name,
    taxId: seller.taxId || null,
    taxIdKind: seller.taxId ? "nip" : "none",
    street: seller.street,
    postalCode: seller.postalCode,
    city: seller.city,
    country: seller.country,
    email: seller.email || null,
    bankAccount: seller.bankAccount,
  };
}

/** Rate for a sale: reverse charge (verified EU business) is outside Polish VAT, otherwise the configured rate. */
export function vatRateFor(settings: InvoicingSettings, reverseCharge: boolean): VatRate {
  return reverseCharge ? "np" : settings.vatRate;
}

function exemptionBasis(settings: InvoicingSettings, rate: VatRate): string | null {
  return rate === "zw" ? settings.exemptionBasis || EXEMPTION_113 : null;
}

async function positionName(payment: {
  kind: PaymentKind;
  description: string;
  subscriptionId: string | null;
}) {
  if (payment.kind !== PaymentKind.SUBSCRIPTION || !payment.subscriptionId) return payment.description;
  const subscription = await db.subscription.findUnique({
    where: { id: payment.subscriptionId },
    include: { plan: { select: { name: true } }, price: { select: { interval: true } } },
  });
  if (!subscription) return payment.description;
  const months = subscription.price?.interval === BillingInterval.YEAR ? "12 mies." : "1 mies.";
  return `Abonament ${subscription.plan.name} (${months})`;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Creates the PENDING invoice for a paid payment (once). Returns its id, or null when nothing to invoice. */
export async function queueInvoiceForPayment(paymentId: string): Promise<string | null> {
  const key = `invoice:${paymentId}`;
  const existing = await db.invoice.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
  if (existing) return existing.id;
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!payment || payment.amount <= 0) return null;

  const settings = await getInvoicingSettings();
  const snapshot = payment.billingSnapshot as BillingSnapshot | null;
  const reverseCharge = Boolean(snapshot?.reverseCharge && snapshot.euVatId);
  const vatRate = vatRateFor(settings, reverseCharge);
  const { netAmount, vatAmount } = splitGross(payment.amount, vatRate);
  try {
    const invoice = await db.invoice.create({
      data: {
        userId: payment.userId,
        paymentId,
        kind: InvoiceKind.INVOICE,
        idempotencyKey: key,
        sellDate: payment.paidAt ?? payment.createdAt,
        currency: payment.currency,
        vatRate,
        netAmount,
        vatAmount,
        grossAmount: payment.amount,
        reverseCharge,
        positionName: await positionName(payment),
        buyer: buyerFromSnapshot(snapshot, {
          name: payment.user.name ?? payment.user.email,
          email: payment.user.email,
        }),
        seller: sellerFromSettings(settings),
      },
    });
    return invoice.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await db.invoice.findUniqueOrThrow({ where: { idempotencyKey: key } })).id;
  }
}

/**
 * Creates a PENDING correction for the refunded amount not corrected yet (refunds are cumulative,
 * so each new refund total yields at most one correction). Returns its id, or null.
 */
export async function queueCorrectionForRefund(paymentId: string): Promise<string | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.refundedAmount <= 0) return null;
  const original = await db.invoice.findUnique({ where: { idempotencyKey: `invoice:${paymentId}` } });
  if (!original) return null;
  const corrected = await db.invoice.aggregate({
    where: { correctedInvoiceId: original.id, kind: InvoiceKind.CORRECTION },
    _sum: { grossAmount: true },
  });
  const alreadyCorrected = -(corrected._sum.grossAmount ?? 0);
  const amount = Math.min(payment.refundedAmount, original.grossAmount) - alreadyCorrected;
  if (amount <= 0) return null;

  const key = `correction:${paymentId}:${payment.refundedAmount}`;
  const { netAmount, vatAmount } = splitGross(-amount, original.vatRate as VatRate);
  try {
    const invoice = await db.invoice.create({
      data: {
        userId: original.userId,
        paymentId,
        kind: InvoiceKind.CORRECTION,
        correctedInvoiceId: original.id,
        idempotencyKey: key,
        sellDate: original.sellDate,
        currency: original.currency,
        vatRate: original.vatRate,
        netAmount,
        vatAmount,
        grossAmount: -amount,
        reverseCharge: original.reverseCharge,
        positionName: original.positionName,
        buyer: original.buyer as Prisma.InputJsonValue,
        seller: original.seller as Prisma.InputJsonValue,
      },
    });
    return invoice.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await db.invoice.findUniqueOrThrow({ where: { idempotencyKey: key } })).id;
  }
}

/** Retryable: the job will run again. */
export class InvoiceNotReadyError extends Error {}

async function buildInput(
  invoice: Prisma.InvoiceGetPayload<object>,
  settings: InvoicingSettings,
  now: Date,
): Promise<InvoiceInput> {
  const line: InvoiceLine = {
    name: invoice.positionName,
    grossAmount: invoice.grossAmount,
    vatRate: invoice.vatRate as VatRate,
  };
  return {
    externalId: invoice.id,
    issueDate: now,
    sellDate: invoice.sellDate,
    currency: invoice.currency,
    seller: invoice.seller as InvoiceParty,
    buyer: invoice.buyer as InvoiceParty,
    line,
    reverseCharge: invoice.reverseCharge,
    exemptionBasis: exemptionBasis(settings, line.vatRate),
    placeOfIssue: settings.placeOfIssue || null,
  };
}

async function createAtProvider(invoiceId: string, deps: InvoicingDeps) {
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const settings = await getInvoicingSettings();
  const now = deps.now?.() ?? new Date();
  const input = await buildInput(invoice, settings, now);

  if (invoice.kind === InvoiceKind.INVOICE) return { issued: await deps.provider.createInvoice(input), now };

  const original = invoice.correctedInvoiceId
    ? await db.invoice.findUnique({ where: { id: invoice.correctedInvoiceId } })
    : null;
  if (!original) throw new InvoicingProviderError("Correction without an original invoice", false);
  if (
    original.status !== InvoiceStatus.ISSUED ||
    !original.providerInvoiceId ||
    !original.number ||
    !original.issueDate
  ) {
    throw new InvoiceNotReadyError("The corrected invoice is not issued yet");
  }
  // State before this correction = original minus earlier corrections (oldest first).
  const earlier = await db.invoice.aggregate({
    where: { correctedInvoiceId: original.id, createdAt: { lt: invoice.createdAt } },
    _sum: { grossAmount: true },
  });
  const before = original.grossAmount + (earlier._sum.grossAmount ?? 0);
  const issued = await deps.provider.createCorrection({
    ...input,
    original: {
      providerInvoiceId: original.providerInvoiceId,
      number: original.number,
      issueDate: original.issueDate,
    },
    before: { ...input.line, grossAmount: before },
    after: { ...input.line, grossAmount: before + invoice.grossAmount },
    reason: "Zwrot płatności",
  });
  return { issued, now };
}

function ksefData(ksef: KsefState) {
  return { ksefStatus: ksef.status as KsefStatus, ksefNumber: ksef.number, ksefError: ksef.error };
}

/**
 * Issues a PENDING invoice, stores its PDF and mails it. `final` marks the last attempt: a failure
 * then leaves the invoice FAILED ("needs manual review"). Throws to request a retry.
 */
export async function issueInvoice(
  invoiceId: string,
  deps: InvoicingDeps,
  options: { final?: boolean } = {},
) {
  let invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status === InvoiceStatus.FAILED) return;

  if (invoice.status === InvoiceStatus.PENDING) {
    await db.invoice.update({ where: { id: invoiceId }, data: { attempts: { increment: 1 } } });
    try {
      const { issued, now } = await createAtProvider(invoiceId, deps);
      invoice = await db.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.ISSUED,
          number: issued.number,
          providerInvoiceId: issued.providerInvoiceId,
          issueDate: now,
          netAmount: issued.netAmount,
          vatAmount: issued.vatAmount,
          grossAmount: issued.grossAmount,
          lastError: null,
          ...ksefData(issued.ksef),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        error instanceof InvoiceNotReadyError ||
        !(error instanceof InvoicingProviderError) ||
        error.retryable;
      const failed = options.final || !retryable;
      await db.invoice.update({
        where: { id: invoiceId },
        data: { lastError: message.slice(0, 1000), ...(failed ? { status: InvoiceStatus.FAILED } : {}) },
      });
      if (failed) {
        console.error(`[invoicing] invoice ${invoiceId} needs manual review: ${message}`);
        return;
      }
      throw error;
    }
  }

  if (!invoice.providerInvoiceId || !invoice.number) return;
  const document = await db.invoiceDocument.findUnique({ where: { invoiceId }, select: { invoiceId: true } });
  let pdf: Buffer | null = null;
  if (!document) {
    pdf = await deps.provider.getPdf(invoice.providerInvoiceId);
    await db.invoiceDocument.upsert({
      where: { invoiceId },
      update: { content: new Uint8Array(pdf) },
      create: { invoiceId, content: new Uint8Array(pdf) },
    });
  }

  if (!invoice.emailedAt) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: invoice.userId },
      select: { email: true, locale: true },
    });
    pdf ??= Buffer.from((await db.invoiceDocument.findUniqueOrThrow({ where: { invoiceId } })).content);
    const mail = await buildLinkMail({
      kind: invoice.kind === InvoiceKind.CORRECTION ? "correctionIssued" : "invoiceIssued",
      to: user.email,
      url: deps.billingUrl,
      locale: isLocale(user.locale) ? user.locale : "pl",
      brand: deps.brand,
      values: { number: invoice.number },
      attachments: [{ filename: pdfFilename(invoice.number), content: pdf, contentType: "application/pdf" }],
    });
    await deps.mailer.send(mail);
    await db.invoice.update({ where: { id: invoiceId }, data: { emailedAt: deps.now?.() ?? new Date() } });
  }
}

export function pdfFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "faktura"}.pdf`;
}

/** Polls the provider for invoices still being processed by KSeF. Returns the number updated. */
export async function syncKsefStates(deps: Pick<InvoicingDeps, "provider">, limit = 50): Promise<number> {
  const invoices = await db.invoice.findMany({
    where: {
      status: InvoiceStatus.ISSUED,
      ksefStatus: KsefStatus.PROCESSING,
      providerInvoiceId: { not: null },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let updated = 0;
  for (const invoice of invoices) {
    try {
      const state = await deps.provider.getKsefState(invoice.providerInvoiceId!);
      await db.invoice.update({ where: { id: invoice.id }, data: ksefData(state) });
      updated += 1;
    } catch (error) {
      console.error(`[invoicing] KSeF status of ${invoice.id} failed`, error);
    }
  }
  return updated;
}

/** PENDING invoices whose job got lost (e.g. Redis was down when the payment arrived). */
export async function stalePendingInvoices(now = new Date(), olderThanMs = 10 * 60_000) {
  return db.invoice.findMany({
    where: { status: InvoiceStatus.PENDING, updatedAt: { lt: new Date(now.getTime() - olderThanMs) } },
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}
