export type LicenseErrorCode =
  | "notFound"
  | "notManager"
  | "alreadyMember"
  | "noSeats"
  | "seatsBelowMembers"
  | "planNotOffered"
  | "licenseInactive"
  | "joinLinkDisabled"
  | "inviteInvalid"
  | "inviteEmailMismatch"
  | "manualLicense"
  | "managerCannotLeave"
  | "managerNotFound"
  | "sponsorNotShown"
  | "sponsorRemovalUnavailable"
  | "alreadyRemoved"
  | "emailNotVerified"
  | "billingProfileRequired";

export class LicenseError extends Error {
  constructor(readonly code: LicenseErrorCode) {
    super(`License operation failed: ${code}`);
    this.name = "LicenseError";
  }
}
