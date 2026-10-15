import { describe, expect, it } from "vitest";

import { FakturowniaInvoicingProvider, mapGovStatus } from "./fakturownia";
import type { InvoiceInput } from "./types";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const input: InvoiceInput = {
  externalId: "inv_1",
  issueDate: new Date("2026-10-15T10:00:00Z"),
  sellDate: new Date("2026-10-15T10:00:00Z"),
  currency: "PLN",
  seller: {
    company: true,
    name: "Moja Firma",
    taxId: "5260001246",
    taxIdKind: "nip",
    street: "Prosta 1",
    postalCode: "00-001",
    city: "Warszawa",
    country: "PL",
  },
  buyer: {
    company: false,
    name: "Jan Maria Kowalski",
    taxId: null,
    taxIdKind: "none",
    street: "Polna 2",
    postalCode: "00-002",
    city: "Kraków",
    country: "PL",
    email: "jan@example.com",
  },
  line: { name: "Plan Pro (1 mies.)", grossAmount: 3900, vatRate: "23" },
  reverseCharge: false,
  exemptionBasis: null,
  placeOfIssue: "Warszawa",
};

const created = {
  id: 101,
  number: "FV 1/10/2026",
  oid: "inv_1",
  price_net: "31.71",
  price_tax: "7.29",
  price_gross: "39.00",
  gov_status: "processing",
  gov_id: null,
};

describe("FakturowniaInvoicingProvider", () => {
  it("creates a paid B2C VAT invoice, sends it to KSeF and maps the totals", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: created }]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma",
      apiToken: "t0k",
      sendToKsef: true,
      fetch: fetchImpl,
    });

    const issued = await provider.createInvoice(input);
    expect(issued).toEqual({
      providerInvoiceId: "101",
      number: "FV 1/10/2026",
      netAmount: 3171,
      vatAmount: 729,
      grossAmount: 3900,
      ksef: { status: "PROCESSING", number: null, error: null },
    });
    expect(calls[0]!.url).toBe("https://firma.fakturownia.pl/invoices.json?api_token=t0k");
    expect(calls[0]!.body).toMatchObject({
      gov_save_and_send: true,
      invoice: {
        kind: "vat",
        status: "paid",
        payment_type: "card",
        oid: "inv_1",
        oid_unique: "yes",
        buyer_company: false,
        buyer_first_name: "Jan",
        buyer_last_name: "Maria Kowalski",
        buyer_tax_no_kind: "empty",
        seller_tax_no: "5260001246",
        positions: [{ name: "Plan Pro (1 mies.)", quantity: 1, total_price_gross: "39.00", tax: "23" }],
      },
    });
  });

  it("marks EU B2B invoices as reverse charge (np, export_service_eu)", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: { ...created, price_tax: "0", price_net: "39.00" } }]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma",
      apiToken: "t",
      sendToKsef: true,
      fetch: fetchImpl,
    });
    await provider.createInvoice({
      ...input,
      reverseCharge: true,
      buyer: {
        ...input.buyer,
        company: true,
        name: "GmbH",
        taxId: "DE123456789",
        taxIdKind: "eu",
        country: "DE",
      },
    });
    expect(calls[0]!.body).toMatchObject({
      invoice: {
        reverse_charge: true,
        np_tax_kind: "export_service_eu",
        buyer_company: true,
        buyer_tax_no: "DE123456789",
        buyer_tax_no_kind: "nip_ue",
        positions: [{ tax: "np" }],
      },
    });
  });

  it("returns the existing invoice when a retry hits the unique oid", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { status: 422, body: { code: "error", message: { oid: ["has already been taken"] } } },
      { body: [{ ...created, id: 99, oid: "other" }, created] },
    ]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma",
      apiToken: "t",
      sendToKsef: false,
      fetch: fetchImpl,
    });
    const issued = await provider.createInvoice(input);
    expect(issued.providerInvoiceId).toBe("101");
    expect(calls[1]!.url).toContain("/invoices.json?api_token=t&period=last_30_days");
  });

  it("classifies server errors as retryable and validation errors as final", async () => {
    const { fetchImpl } = fakeFetch([
      { status: 503, body: "unavailable" },
      { status: 422, body: { message: { buyer_tax_no: ["is invalid"] } } },
    ]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma",
      apiToken: "t",
      sendToKsef: true,
      fetch: fetchImpl,
    });
    await expect(provider.createInvoice(input)).rejects.toMatchObject({ retryable: true });
    await expect(provider.createInvoice(input)).rejects.toMatchObject({ retryable: false });
  });

  it("builds corrections against the original invoice", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { body: { ...created, id: 102, number: "KOR 1/10/2026", price_gross: "-39.00" } },
    ]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma",
      apiToken: "t",
      sendToKsef: true,
      fetch: fetchImpl,
    });
    const issued = await provider.createCorrection({
      ...input,
      externalId: "inv_2",
      original: { providerInvoiceId: "101", number: "FV 1/10/2026", issueDate: input.issueDate },
      before: input.line,
      after: { ...input.line, grossAmount: 0 },
      reason: "Zwrot płatności",
    });
    expect(issued.grossAmount).toBe(-3900);
    expect(calls[0]!.body).toMatchObject({
      invoice: {
        kind: "correction",
        invoice_id: "101",
        correction_reason: "Zwrot płatności",
        positions: [
          {
            quantity: -1,
            total_price_gross: "-39.00",
            correction_before_attributes: {
              quantity: 1,
              total_price_gross: "39.00",
              kind: "correction_before",
            },
            correction_after_attributes: { quantity: 0, total_price_gross: "0.00", kind: "correction_after" },
          },
        ],
      },
    });
  });

  it("reads the KSeF state and downloads the PDF", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { body: { gov_status: "demo_ok", gov_id: "5260001246-20261015-ABC" } },
      { body: "%PDF-1.4" },
    ]);
    const provider = new FakturowniaInvoicingProvider({
      domain: "firma.fakturownia.pl",
      apiToken: "t",
      sendToKsef: true,
      fetch: fetchImpl,
    });
    expect(await provider.getKsefState("101")).toEqual({
      status: "ACCEPTED",
      number: "5260001246-20261015-ABC",
      error: null,
    });
    expect((await provider.getPdf("101")).toString()).toBe("%PDF-1.4");
    expect(calls[1]!.url).toBe("https://firma.fakturownia.pl/invoices/101.pdf?api_token=t");
  });
});

describe("mapGovStatus", () => {
  it("maps statuses including demo and errors", () => {
    expect(mapGovStatus({ gov_status: null })).toMatchObject({ status: "NOT_SENT" });
    expect(mapGovStatus({ gov_status: "status_check_error" })).toMatchObject({ status: "PROCESSING" });
    expect(mapGovStatus({ gov_status: "send_error", gov_error_messages: ["Błędny NIP"] })).toEqual({
      status: "ERROR",
      number: null,
      error: "Błędny NIP",
    });
    expect(mapGovStatus({ gov_status: "not_applicable" })).toMatchObject({ status: "NOT_APPLICABLE" });
  });
});
