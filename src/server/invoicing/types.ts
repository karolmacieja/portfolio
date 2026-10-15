/**
 * Invoicing adapter (Fakturownia in production, mock for development/tests). The provider numbers
 * the documents, renders the PDF and sends them to KSeF; we keep a copy of each invoice and its PDF.
 */

/** "23", "8", "5", "0": rates in percent; "zw": exempt; "np": outside Polish VAT (reverse charge). */
export type VatRate = "23" | "8" | "5" | "0" | "zw" | "np";

export type InvoiceParty = {
  /** Company or person; persons are split into first/last name for KSeF (B2C). */
  company: boolean;
  name: string;
  /** Polish NIP or EU VAT id (with country prefix); null for persons. */
  taxId: string | null;
  taxIdKind: "nip" | "eu" | "none";
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string | null;
};

export type InvoiceLine = {
  name: string;
  /** Gross amount in grosze (negative in correction differences). */
  grossAmount: number;
  vatRate: VatRate;
};

export type InvoiceInput = {
  /** Our invoice id; stored at the provider as the order id to detect duplicates after retries. */
  externalId: string;
  issueDate: Date;
  sellDate: Date;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  line: InvoiceLine;
  reverseCharge: boolean;
  /** Legal basis printed for exempt ("zw") invoices. */
  exemptionBasis: string | null;
  placeOfIssue: string | null;
};

export type CorrectionInput = Omit<InvoiceInput, "line"> & {
  original: { providerInvoiceId: string; number: string; issueDate: Date };
  /** Line as invoiced before this correction and after it (gross amounts, same rate). */
  before: InvoiceLine;
  after: InvoiceLine;
  reason: string;
};

export type KsefState = {
  status: "NOT_SENT" | "PROCESSING" | "ACCEPTED" | "ERROR" | "NOT_APPLICABLE";
  number: string | null;
  error: string | null;
};

export type IssuedInvoice = {
  providerInvoiceId: string;
  number: string;
  /** Totals as calculated by the provider (authoritative), in grosze. */
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  ksef: KsefState;
};

export interface InvoicingProvider {
  readonly name: string;
  createInvoice(input: InvoiceInput): Promise<IssuedInvoice>;
  createCorrection(input: CorrectionInput): Promise<IssuedInvoice>;
  getKsefState(providerInvoiceId: string): Promise<KsefState>;
  /** Sends an issued invoice to KSeF again (after a KSeF error was fixed). */
  resendToKsef(providerInvoiceId: string): Promise<KsefState>;
  getPdf(providerInvoiceId: string): Promise<Buffer>;
}

/** Transient errors (network, 5xx, rate limits) are retried; others need a human. */
export class InvoicingProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "InvoicingProviderError";
  }
}
