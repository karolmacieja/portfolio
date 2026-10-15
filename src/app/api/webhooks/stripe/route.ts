import { NextResponse, type NextRequest } from "next/server";

import { handleBillingEvent } from "@/server/billing/events";
import { getPaymentProvider, nextBillingDeps } from "@/server/billing/provider";
import { PaymentProviderError } from "@/server/payments";

/**
 * Stripe webhook endpoint: verifies the signature, normalizes the event and applies it.
 * 2xx = handled or ignored (duplicates, unhandled types); 5xx makes Stripe retry.
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider();
  if (provider.name !== "stripe") return NextResponse.json({ error: "notConfigured" }, { status: 404 });

  const rawBody = await request.text();
  let event;
  try {
    event = await provider.parseWebhook(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    if (error instanceof PaymentProviderError)
      return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
  if (!event) return NextResponse.json({ received: true, ignored: true });

  try {
    const result = await handleBillingEvent(event, "stripe", nextBillingDeps());
    return NextResponse.json({ received: true, duplicate: !result.processed });
  } catch (error) {
    console.error("Billing webhook failed", event.type, event.id, error);
    return NextResponse.json({ error: "processingFailed" }, { status: 500 });
  }
}
