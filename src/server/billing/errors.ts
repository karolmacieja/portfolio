export type BillingErrorCode =
  | "notFound"
  | "emailNotVerified"
  | "billingProfileRequired"
  | "alreadySubscribed"
  | "noSubscription"
  | "priceNotSynced"
  | "couponInvalid"
  | "taxIdInvalid"
  | "euVatIdInvalid"
  | "alreadyPurchased"
  | "notPremium"
  | "planRequired";

/** Expected billing failures; mapped to `billing.errors.*` messages. */
export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode) {
    super(`Billing operation failed: ${code}`);
    this.name = "BillingError";
  }
}
