import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockMailer } from "@/server/mail/mock";

import { EXEMPTION_113, invoicingSettingsSchema } from "./settings";
import { buyerFromSnapshot, pdfFilename, vatRateFor } from "./service";

describe("invoice helpers", () => {
  it("uses the configured rate, or np for reverse charge", () => {
    const settings = invoicingSettingsSchema.parse({ vatRate: "zw" });
    expect(vatRateFor(settings, false)).toBe("zw");
    expect(vatRateFor(settings, true)).toBe("np");
    expect(EXEMPTION_113).toMatch(/art\. 113/);
  });

  it("maps billing profiles onto invoice buyers", () => {
    const fallback = { name: "Jan", email: "jan@example.com" };
    expect(
      buyerFromSnapshot(
        {
          type: "COMPANY",
          fullName: "Jan",
          companyName: "Firma",
          taxId: "5260001246",
          line1: "A 1",
          line2: "lok. 2",
        },
        fallback,
      ),
    ).toMatchObject({
      company: true,
      name: "Firma",
      taxId: "5260001246",
      taxIdKind: "nip",
      street: "A 1, lok. 2",
    });
    expect(
      buyerFromSnapshot(
        { type: "COMPANY", companyName: "GmbH", euVatId: "DE123456789", country: "DE" },
        fallback,
      ),
    ).toMatchObject({ taxIdKind: "eu", taxId: "DE123456789", country: "DE" });
    expect(buyerFromSnapshot(null, fallback)).toMatchObject({
      company: false,
      name: "Jan",
      taxId: null,
      taxIdKind: "none",
    });
  });

  it("builds safe PDF file names", () => {
    expect(pdfFilename("FV/12/10/2026")).toBe("FV-12-10-2026.pdf");
  });
});

// Integration: billing events -> invoice rows -> issuing (mock provider) -> corrections -> KSeF (database).
describe.skipIf(!process.env.DATABASE_URL)("invoicing flow (database)", async () => {
  const { db } = await import("@/lib/db");
  const { handleBillingEvent } = await import("@/server/billing/events");
  const { MockInvoicingProvider } = await import("./mock");
  const service = await import("./service");
  const client = await import("./client");

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let enqueued: string[];
  let mailer: MockMailer;
  const provider = new MockInvoicingProvider();

  const billingDeps = () => ({
    invalidate: () => {},
    mailer,
    brand: "Test",
    billingUrl: "http://app.test/billing",
    enqueueInvoice: (id: string) => void enqueued.push(id),
  });
  const invoicingDeps = () => ({ provider, mailer, brand: "Test", billingUrl: "http://app.test/billing" });

  async function createUser(name: string, profile: Record<string, unknown> = {}) {
    const user = await db.user.create({
      data: {
        email: `${name.replace(/\W+/g, "-").toLowerCase()}-${run}@test.local`,
        name,
        emailVerified: new Date(),
        billingProfile: {
          create: {
            type: "PERSON",
            fullName: name,
            line1: "Testowa 1",
            postalCode: "00-001",
            city: "Warszawa",
            ...profile,
          },
        },
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  /** A paid one-time purchase through the same event path as Stripe (template checkout). */
  async function pay(userId: string, amount: number) {
    const template = await db.template.findFirst({ select: { id: true } });
    if (!template) throw new Error("Needs at least one template (any)");
    const sessionId = `cs_${randomUUID()}`;
    const paymentRef = `pi_${randomUUID()}`;
    const id = `test_evt_${run}_${eventIds.length}`;
    eventIds.push(id);
    await handleBillingEvent(
      {
        id,
        type: "checkout.completed",
        sessionId,
        mode: "payment",
        customerId: null,
        subscriptionId: null,
        amountTotal: amount,
        currency: "PLN",
        paymentRef,
        metadata: { kind: "template", userId, templateId: template.id },
      },
      "test",
      billingDeps(),
    );
    return {
      paymentRef,
      payment: await db.payment.findUniqueOrThrow({ where: { providerPaymentId: sessionId } }),
    };
  }

  async function refund(paymentRef: string, amountRefunded: number) {
    const id = `test_evt_${run}_${eventIds.length}`;
    eventIds.push(id);
    await handleBillingEvent(
      { id, type: "payment.refunded", paymentRef, amountRefunded, currency: "PLN" },
      "test",
      billingDeps(),
    );
  }

  beforeAll(async () => {
    // Templates may not exist in CI (no seed): create a throwaway one when needed.
    if (!(await db.template.count())) {
      await db.template.create({ data: { slug: `test-${run}`, name: "Test", category: "other", draft: {} } });
    }
  });

  beforeEach(() => {
    enqueued = [];
    mailer = new MockMailer(() => {});
  });

  afterAll(async () => {
    await db.invoice.deleteMany({ where: { userId: { in: userIds }, kind: "CORRECTION" } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
    await db.template.deleteMany({ where: { slug: `test-${run}` } });
  });

  it("issues a VAT invoice for a paid payment, stores the PDF and mails it once", async () => {
    const userId = await createUser("Anna Nowak");
    const { payment } = await pay(userId, 4900);
    expect(enqueued).toHaveLength(1);
    const invoiceId = enqueued[0]!;
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({
      paymentId: payment.id,
      status: "PENDING",
      vatRate: "23",
      grossAmount: 4900,
      netAmount: 3984,
      vatAmount: 916,
    });

    await service.issueInvoice(invoiceId, invoicingDeps());
    await service.issueInvoice(invoiceId, invoicingDeps());
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { document: true },
    });
    expect(invoice).toMatchObject({ status: "ISSUED", ksefStatus: "PROCESSING", attempts: 1 });
    expect(invoice.number).toMatch(/^FV\/\d+\/\d{2}\/\d{4}$/);
    expect(Buffer.from(invoice.document!.content).subarray(0, 5).toString()).toBe("%PDF-");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe(`anna-nowak-${run}@test.local`);
    expect(mailer.sent[0]!.attachments?.[0]).toMatchObject({ contentType: "application/pdf" });
    expect(mailer.sent[0]!.subject).toContain(invoice.number!);

    // Repeated events don't create a second invoice.
    expect(await service.queueInvoiceForPayment(payment.id)).toBe(invoiceId);

    expect(await service.syncKsefStates(invoicingDeps())).toBeGreaterThanOrEqual(1);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({
      ksefStatus: "ACCEPTED",
    });
  });

  it("invoices verified EU businesses with reverse charge (np, no VAT)", async () => {
    const userId = await createUser("GmbH", {
      type: "COMPANY",
      companyName: "Muster GmbH",
      euVatId: "DE123456789",
      reverseCharge: true,
      country: "DE",
    });
    await pay(userId, 3900);
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: enqueued[0]! } });
    expect(invoice).toMatchObject({ vatRate: "np", reverseCharge: true, netAmount: 3900, vatAmount: 0 });
    expect(invoice.buyer).toMatchObject({ company: true, taxIdKind: "eu", taxId: "DE123456789" });
  });

  it("issues one correction per refunded total, after the original invoice", async () => {
    const userId = await createUser("Refund");
    const { paymentRef, payment } = await pay(userId, 3900);
    const original = enqueued[0]!;

    await refund(paymentRef, 1000);
    const first = enqueued[1]!;
    // The original isn't issued yet: the correction waits (retryable), unless it's the last attempt.
    await expect(service.issueInvoice(first, invoicingDeps())).rejects.toThrow(/not issued yet/);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ status: "PENDING" });

    await service.issueInvoice(original, invoicingDeps());
    await service.issueInvoice(first, invoicingDeps());

    await refund(paymentRef, 1000); // duplicate total (another event id): nothing new
    expect(enqueued).toHaveLength(2);
    await refund(paymentRef, 3900);
    const second = enqueued[2]!;
    await service.issueInvoice(second, invoicingDeps());

    const corrections = await db.invoice.findMany({
      where: { correctedInvoiceId: original },
      orderBy: { createdAt: "asc" },
    });
    expect(corrections.map((c) => [c.status, c.grossAmount, c.number?.startsWith("KOR/")])).toEqual([
      ["ISSUED", -1000, true],
      ["ISSUED", -2900, true],
    ]);
    expect(await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
      status: "REFUNDED",
      refundedAmount: 3900,
    });
    expect(mailer.sent.map((mail) => mail.subject)).toEqual([
      expect.stringContaining("Faktura FV/"),
      expect.stringContaining("Faktura korygująca KOR/"),
      expect.stringContaining("Faktura korygująca KOR/"),
    ]);
    // A fully refunded template purchase no longer grants the template.
    expect(await db.templatePurchase.count({ where: { userId } })).toBe(0);
  });

  it("marks invoices the provider rejects as FAILED (manual review) without retrying", async () => {
    const userId = await createUser("Zły [fail] Nabywca");
    await pay(userId, 1900);
    const invoiceId = enqueued[0]!;
    await service.issueInvoice(invoiceId, invoicingDeps());
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({
      status: "FAILED",
      lastError: expect.stringContaining("rejected"),
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it("shows clients only their own issued invoices and PDFs", async () => {
    const owner = await createUser("Owner");
    const other = await createUser("Other");
    await pay(owner, 1900);
    const invoiceId = enqueued[0]!;
    expect(await client.listUserInvoices(owner)).toHaveLength(0); // pending invoices are not listed
    await service.issueInvoice(invoiceId, invoicingDeps());

    expect((await client.listUserInvoices(owner)).map((i) => i.id)).toEqual([invoiceId]);
    expect(await client.listUserInvoices(other)).toHaveLength(0);
    expect(await client.getInvoicePdf(invoiceId, { userId: owner })).toMatchObject({
      number: expect.any(String),
    });
    expect(await client.getInvoicePdf(invoiceId, { userId: other })).toBeNull();
    expect(await client.getInvoicePdf(invoiceId, { userId: other, asStaff: true })).not.toBeNull();
  });
});
