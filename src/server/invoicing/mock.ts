import { createHash } from "node:crypto";

import { db } from "@/lib/db";

import { splitGross } from "./amounts";
import { renderInvoicePdf, type InvoicePdfData } from "./pdf";
import {
  InvoicingProviderError,
  type CorrectionInput,
  type InvoiceInput,
  type InvoicingProvider,
  type IssuedInvoice,
  type KsefState,
} from "./types";

/**
 * Mock invoicing: numbers documents locally, renders a simple PDF and simulates KSeF (processing,
 * then accepted on the next status check). A buyer name containing "[fail]" makes issuing fail, to
 * exercise the "needs manual review" path.
 */
export const MOCK_FAIL_MARKER = "[fail]";
const pdfs = new Map<string, Buffer>();

async function nextNumber(prefix: string, issueDate: Date): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const month = String(issueDate.getUTCMonth() + 1).padStart(2, "0");
  const from = new Date(Date.UTC(year, issueDate.getUTCMonth(), 1));
  const count = await db.invoice.count({
    where: { number: { startsWith: `${prefix}/` }, issueDate: { gte: from }, status: "ISSUED" },
  });
  return `${prefix}/${count + 1}/${month}/${year}`;
}

function ksefNumber(providerInvoiceId: string, taxId: string): string {
  const hash = createHash("sha256").update(providerInvoiceId).digest("hex").slice(0, 12).toUpperCase();
  return `${taxId || "0000000000"}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${hash}`;
}

export class MockInvoicingProvider implements InvoicingProvider {
  readonly name = "mock";

  private async issue(
    input: Omit<InvoiceInput, "line">,
    prefix: string,
    pdf: Pick<InvoicePdfData, "title" | "lines" | "notes">,
    grossAmount: number,
  ): Promise<IssuedInvoice> {
    if (input.buyer.name.includes(MOCK_FAIL_MARKER)) {
      throw new InvoicingProviderError("Mock: buyer data rejected", false);
    }
    const number = await nextNumber(prefix, input.issueDate);
    const providerInvoiceId = `mock_inv_${input.externalId}`;
    pdfs.set(
      providerInvoiceId,
      await renderInvoicePdf({
        ...pdf,
        number,
        issueDate: input.issueDate,
        sellDate: input.sellDate,
        placeOfIssue: input.placeOfIssue,
        seller: input.seller,
        buyer: input.buyer,
        currency: input.currency,
        reverseCharge: input.reverseCharge,
        exemptionBasis: input.exemptionBasis,
      }),
    );
    const rate = input.reverseCharge ? "np" : (pdf.lines[0]?.vatRate ?? "23");
    return {
      providerInvoiceId,
      number,
      grossAmount,
      ...splitGross(grossAmount, rate),
      ksef: { status: "PROCESSING", number: null, error: null },
    };
  }

  async createInvoice(input: InvoiceInput) {
    return this.issue(
      input,
      "FV",
      { title: "Faktura VAT", lines: [input.line], notes: [] },
      input.line.grossAmount,
    );
  }

  async createCorrection(input: CorrectionInput) {
    const difference = input.after.grossAmount - input.before.grossAmount;
    return this.issue(
      input,
      "KOR",
      {
        title: "Faktura korygująca",
        lines: [
          { ...input.before, label: "Przed korektą", informational: true },
          { ...input.after, label: "Po korekcie", informational: true },
          { ...input.after, grossAmount: difference, label: "Różnica" },
        ],
        notes: [
          `Dotyczy faktury ${input.original.number} z dnia ${input.original.issueDate.toISOString().slice(0, 10)}.`,
          `Przyczyna korekty: ${input.reason}`,
        ],
      },
      difference,
    );
  }

  async getKsefState(providerInvoiceId: string): Promise<KsefState> {
    const invoice = await db.invoice.findFirst({ where: { providerInvoiceId }, select: { seller: true } });
    const taxId = (invoice?.seller as { taxId?: string } | null)?.taxId ?? "";
    return { status: "ACCEPTED", number: ksefNumber(providerInvoiceId, taxId), error: null };
  }

  async resendToKsef(): Promise<KsefState> {
    return { status: "PROCESSING", number: null, error: null };
  }

  async getPdf(providerInvoiceId: string): Promise<Buffer> {
    const cached = pdfs.get(providerInvoiceId);
    if (cached) {
      pdfs.delete(providerInvoiceId);
      return cached;
    }
    // The process restarted between issuing and downloading: render again from our copy.
    const invoice = await db.invoice.findFirst({ where: { providerInvoiceId } });
    if (!invoice?.number || !invoice.issueDate)
      throw new InvoicingProviderError("Mock: unknown invoice", false);
    return renderInvoicePdf({
      title: invoice.kind === "CORRECTION" ? "Faktura korygująca" : "Faktura VAT",
      number: invoice.number,
      issueDate: invoice.issueDate,
      sellDate: invoice.sellDate,
      placeOfIssue: null,
      seller: invoice.seller as InvoicePdfData["seller"],
      buyer: invoice.buyer as InvoicePdfData["buyer"],
      lines: [
        { name: invoice.positionName, grossAmount: invoice.grossAmount, vatRate: invoice.vatRate as "23" },
      ],
      currency: invoice.currency,
      reverseCharge: invoice.reverseCharge,
      exemptionBasis: null,
      notes: [],
    });
  }
}
