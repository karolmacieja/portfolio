import { fromDecimal, toDecimal } from "./amounts";
import {
  InvoicingProviderError,
  type CorrectionInput,
  type InvoiceInput,
  type InvoiceLine,
  type InvoiceParty,
  type InvoicingProvider,
  type IssuedInvoice,
  type KsefState,
} from "./types";

/**
 * Fakturownia API (https://github.com/fakturownia/API, KSeF guide: KSeF.md). Invoices are created
 * as paid VAT invoices with our invoice id as `oid` (unique), and sent to KSeF with
 * `gov_save_and_send`; the KSeF number arrives asynchronously (`gov_status` / `gov_id`).
 */

export type FakturowniaConfig = {
  domain: string;
  apiToken: string;
  departmentId?: string;
  sendToKsef: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type ApiInvoice = {
  id: number;
  number: string;
  oid?: string | null;
  price_net?: string | number;
  price_tax?: string | number;
  price_gross?: string | number;
  gov_status?: string | null;
  gov_id?: string | null;
  gov_error_messages?: string[] | string | null;
};

const date = (value: Date) => value.toISOString().slice(0, 10);

/** Maps `gov_status` (production or `demo_*`) onto our KSeF states. */
export function mapGovStatus(
  invoice: Pick<ApiInvoice, "gov_status" | "gov_id" | "gov_error_messages">,
): KsefState {
  const status = (invoice.gov_status ?? "").replace(/^demo_/, "");
  const errors = invoice.gov_error_messages;
  const error = Array.isArray(errors) ? errors.join("; ") : (errors ?? null);
  switch (status) {
    case "":
      return { status: "NOT_SENT", number: null, error: null };
    case "ok":
      return { status: "ACCEPTED", number: invoice.gov_id ?? null, error: null };
    case "processing":
    case "offline":
    // The invoice may already have been accepted; keep checking.
    case "status_check_error":
      return { status: "PROCESSING", number: invoice.gov_id ?? null, error: null };
    case "not_applicable":
      return { status: "NOT_APPLICABLE", number: null, error: null };
    default:
      return { status: "ERROR", number: invoice.gov_id ?? null, error: error || status };
  }
}

function splitName(name: string): { first: string; last: string } {
  const [first = name, ...rest] = name.trim().split(/\s+/);
  return { first, last: rest.join(" ") || first };
}

function partyFields(prefix: "seller" | "buyer", party: InvoiceParty): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [`${prefix}_name`]: party.name,
    [`${prefix}_tax_no`]: party.taxId ?? "",
    [`${prefix}_tax_no_kind`]:
      party.taxIdKind === "eu" ? "nip_ue" : party.taxIdKind === "none" ? "empty" : "",
    [`${prefix}_street`]: party.street,
    [`${prefix}_post_code`]: party.postalCode,
    [`${prefix}_city`]: party.city,
    [`${prefix}_country`]: party.country,
  };
  if (prefix === "buyer") {
    fields.buyer_company = party.company;
    if (party.email) fields.buyer_email = party.email;
    if (!party.company) {
      const { first, last } = splitName(party.name);
      Object.assign(fields, { buyer_first_name: first, buyer_last_name: last, buyer_tax_no_kind: "empty" });
    }
  }
  return fields;
}

function position(line: InvoiceLine, quantity: number) {
  return { name: line.name, quantity, total_price_gross: toDecimal(line.grossAmount), tax: line.vatRate };
}

export class FakturowniaInvoicingProvider implements InvoicingProvider {
  readonly name = "fakturownia";
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: FakturowniaConfig) {
    const host = config.domain.includes(".") ? config.domain : `${config.domain}.fakturownia.pl`;
    this.baseUrl = `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    this.fetch = config.fetch ?? fetch;
  }

  private async request(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown; query?: string } = {},
  ) {
    const query = `api_token=${encodeURIComponent(this.config.apiToken)}${init.query ? `&${init.query}` : ""}`;
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}?${query}`, {
        method: init.method ?? "GET",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });
    } catch (error) {
      throw new InvoicingProviderError(`Fakturownia unreachable: ${(error as Error).message}`, true);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
      // Never echo the request (it carries the API token); the response body holds validation messages.
      throw new InvoicingProviderError(`Fakturownia ${response.status}: ${body.slice(0, 500)}`, retryable);
    }
    return response;
  }

  private baseInvoice(input: InvoiceInput | CorrectionInput) {
    const rate = input.reverseCharge ? "np" : null;
    return {
      issue_date: date(input.issueDate),
      sell_date: date(input.sellDate),
      ...(input.placeOfIssue ? { place: input.placeOfIssue } : {}),
      currency: input.currency,
      lang: "pl",
      payment_type: "card",
      status: "paid",
      paid_date: date(input.issueDate),
      payment_to_kind: "off",
      oid: input.externalId,
      oid_unique: "yes",
      ...(this.config.departmentId ? { department_id: this.config.departmentId } : {}),
      ...partyFields("seller", input.seller),
      ...partyFields("buyer", input.buyer),
      ...(rate ? { reverse_charge: true, np_tax_kind: "export_service_eu" } : {}),
      ...(input.exemptionBasis ? { exempt_tax_kind: input.exemptionBasis } : {}),
    };
  }

  private toIssued(invoice: ApiInvoice): IssuedInvoice {
    return {
      providerInvoiceId: String(invoice.id),
      number: invoice.number,
      netAmount: fromDecimal(invoice.price_net ?? 0),
      vatAmount: fromDecimal(invoice.price_tax ?? 0),
      grossAmount: fromDecimal(invoice.price_gross ?? 0),
      ksef: mapGovStatus(invoice),
    };
  }

  /** After a timeout the invoice may exist already: `oid_unique` refuses the duplicate, so look it up. */
  private async findByOid(oid: string): Promise<ApiInvoice | null> {
    const response = await this.request("/invoices.json", {
      query: "period=last_30_days&per_page=100&order=updated_at.desc",
    });
    const invoices = (await response.json()) as ApiInvoice[];
    return invoices.find((invoice) => invoice.oid === oid) ?? null;
  }

  private async create(invoice: Record<string, unknown>, oid: string): Promise<IssuedInvoice> {
    try {
      const response = await this.request("/invoices.json", {
        method: "POST",
        body: { api_token: this.config.apiToken, gov_save_and_send: this.config.sendToKsef, invoice },
      });
      return this.toIssued((await response.json()) as ApiInvoice);
    } catch (error) {
      if (error instanceof InvoicingProviderError && !error.retryable && /oid/i.test(error.message)) {
        const existing = await this.findByOid(oid);
        if (existing) return this.toIssued(existing);
      }
      throw error;
    }
  }

  async createInvoice(input: InvoiceInput): Promise<IssuedInvoice> {
    const line = input.reverseCharge ? { ...input.line, vatRate: "np" as const } : input.line;
    return this.create(
      { ...this.baseInvoice(input), kind: "vat", positions: [position(line, 1)] },
      input.externalId,
    );
  }

  async createCorrection(input: CorrectionInput): Promise<IssuedInvoice> {
    const rate = (line: InvoiceLine) => (input.reverseCharge ? { ...line, vatRate: "np" as const } : line);
    const before = rate(input.before);
    const after = rate(input.after);
    const fullRefund = after.grossAmount === 0;
    const difference = { ...after, grossAmount: after.grossAmount - before.grossAmount };
    return this.create(
      {
        ...this.baseInvoice(input),
        kind: "correction",
        invoice_id: input.original.providerInvoiceId,
        from_invoice_id: input.original.providerInvoiceId,
        correction_reason: input.reason,
        positions: [
          {
            ...position(difference, fullRefund ? -1 : 1),
            kind: "correction",
            correction_before_attributes: { ...position(before, 1), kind: "correction_before" },
            correction_after_attributes: { ...position(after, fullRefund ? 0 : 1), kind: "correction_after" },
          },
        ],
      },
      input.externalId,
    );
  }

  async getKsefState(providerInvoiceId: string): Promise<KsefState> {
    const response = await this.request(`/invoices/${encodeURIComponent(providerInvoiceId)}.json`, {
      query: "fields[invoice]=gov_status,gov_id,gov_error_messages",
    });
    return mapGovStatus((await response.json()) as ApiInvoice);
  }

  async resendToKsef(providerInvoiceId: string): Promise<KsefState> {
    const response = await this.request(`/invoices/${encodeURIComponent(providerInvoiceId)}.json`, {
      query: "send_to_ksef=yes",
    });
    return mapGovStatus((await response.json()) as ApiInvoice);
  }

  async getPdf(providerInvoiceId: string): Promise<Buffer> {
    const response = await this.request(`/invoices/${encodeURIComponent(providerInvoiceId)}.pdf`);
    return Buffer.from(await response.arrayBuffer());
  }
}
