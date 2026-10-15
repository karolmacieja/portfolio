import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { StripePaymentProvider } from "./stripe";
import { PaymentProviderError } from "./types";

const SECRET = "whsec_test_secret";
const apiCalls: string[] = [];
// Stripe API calls made while parsing webhooks (invoice payments lookup) hit this fake.
const fakeFetch = (async (url: string | URL) => {
  apiCalls.push(String(url));
  return new Response(
    JSON.stringify({
      object: "list",
      data: [
        {
          id: "inpay_1",
          object: "invoice_payment",
          payment: { type: "payment_intent", payment_intent: "pi_1" },
        },
      ],
      has_more: false,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}) as typeof fetch;
const provider = new StripePaymentProvider("sk_test_dummy", SECRET, Stripe.createFetchHttpClient(fakeFetch));
const stripe = new Stripe("sk_test_dummy");

function signed(event: object) {
  const payload = JSON.stringify(event);
  return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}

const subscriptionObject = {
  id: "sub_123",
  object: "subscription",
  customer: "cus_1",
  status: "past_due",
  cancel_at_period_end: false,
  cancel_at: null,
  trial_end: null,
  metadata: { userId: "u1", planId: "p1" },
  items: {
    object: "list",
    data: [{ id: "si_1", price: { id: "price_1" }, current_period_end: 1_790_000_000 }],
  },
};

describe("StripePaymentProvider webhooks", () => {
  it("verifies the signature and maps subscription events (period from the subscription item)", async () => {
    const { payload, header } = signed({
      id: "evt_1",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: subscriptionObject },
    });
    expect(await provider.parseWebhook(payload, header)).toEqual({
      id: "evt_1",
      type: "subscription.updated",
      subscription: {
        id: "sub_123",
        customerId: "cus_1",
        status: "PAST_DUE",
        priceRef: "price_1",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(1_790_000_000 * 1000),
        trialEnd: null,
        metadata: { userId: "u1", planId: "p1" },
      },
    });
  });

  it("maps invoices with the subscription under parent.subscription_details", async () => {
    const invoice = {
      id: "in_1",
      object: "invoice",
      customer: "cus_1",
      amount_paid: 3900,
      amount_due: 3900,
      currency: "pln",
      number: "ABC-001",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_123", metadata: {} },
      },
      lines: { object: "list", data: [{ description: "1 × Pro" }] },
    };
    const { payload, header } = signed({
      id: "evt_2",
      object: "event",
      type: "invoice.paid",
      data: { object: invoice },
    });
    expect(await provider.parseWebhook(payload, header)).toEqual({
      id: "evt_2",
      type: "invoice.paid",
      invoice: {
        id: "in_1",
        customerId: "cus_1",
        subscriptionId: "sub_123",
        amountPaid: 3900,
        amountDue: 3900,
        currency: "PLN",
        description: "1 × Pro",
        paymentRef: "pi_1",
        subscriptionMetadata: {},
      },
    });
    expect(apiCalls[0]).toContain("/v1/invoice_payments?invoice=in_1");
  });

  it("maps refunds to the cumulative refunded amount of the PaymentIntent", async () => {
    const { payload, header } = signed({
      id: "evt_5",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          object: "charge",
          payment_intent: "pi_1",
          amount_refunded: 1500,
          currency: "pln",
        },
      },
    });
    expect(await provider.parseWebhook(payload, header)).toEqual({
      id: "evt_5",
      type: "payment.refunded",
      paymentRef: "pi_1",
      amountRefunded: 1500,
      currency: "PLN",
    });
  });

  it("rejects forged or missing signatures and ignores unhandled event types", async () => {
    const { payload, header } = signed({
      id: "evt_3",
      object: "event",
      type: "customer.created",
      data: { object: {} },
    });
    expect(await provider.parseWebhook(payload, header)).toBeNull();
    await expect(provider.parseWebhook(payload.replace("evt_3", "evt_4"), header)).rejects.toEqual(
      new PaymentProviderError("invalidSignature"),
    );
    await expect(provider.parseWebhook(payload, null)).rejects.toEqual(
      new PaymentProviderError("invalidSignature"),
    );
  });
});
