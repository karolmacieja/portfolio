import { CredentialsSignin } from "next-auth";

/** Error codes surfaced to the sign-in form; mapped to `auth.errors.*` translation keys. */
export const AUTH_ERROR_CODES = {
  invalidCredentials: "invalid_credentials",
  accountBlocked: "account_blocked",
  rateLimited: "rate_limited",
} as const;

export class InvalidCredentialsError extends CredentialsSignin {
  override code = AUTH_ERROR_CODES.invalidCredentials;
}

export class AccountBlockedError extends CredentialsSignin {
  override code = AUTH_ERROR_CODES.accountBlocked;
}

export class RateLimitedError extends CredentialsSignin {
  override code = AUTH_ERROR_CODES.rateLimited;
}
