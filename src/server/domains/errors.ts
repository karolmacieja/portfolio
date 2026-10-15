import type { DomainNameError } from "@/lib/domain-name";

export type DomainErrorCode =
  | "notFound"
  | "featureRequired"
  | "purchaseNotAllowed"
  | `hostname.${DomainNameError}`
  | "hostnameTaken"
  | "limitReached"
  | "providerError"
  | "notDisabled"
  | "tldNotOffered"
  | "notAvailable"
  | "priceUnavailable"
  | "emailNotVerified"
  | "orderNotActive"
  | "rateLimited"
  | "registrantInvalid";

/** Expected domain failures; mapped to `domains.errors.*` messages. */
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(`Domain operation failed: ${code}`);
    this.name = "DomainError";
  }
}
