import { describe, expect, it } from "vitest";

import { hasRole, isAdmin, isStaff, Role, STAFF_ROLES } from "./roles";

describe("roles", () => {
  it("hasRole checks membership and rejects missing roles", () => {
    expect(hasRole(Role.ADMIN, STAFF_ROLES)).toBe(true);
    expect(hasRole(Role.CLIENT, STAFF_ROLES)).toBe(false);
    expect(hasRole(undefined, STAFF_ROLES)).toBe(false);
    expect(hasRole(null, [Role.CLIENT])).toBe(false);
  });

  it("treats ADMIN and SUPPORT as staff", () => {
    expect(isStaff(Role.ADMIN)).toBe(true);
    expect(isStaff(Role.SUPPORT)).toBe(true);
    expect(isStaff(Role.CLIENT)).toBe(false);
  });

  it("isAdmin is true only for ADMIN", () => {
    expect(isAdmin(Role.ADMIN)).toBe(true);
    expect(isAdmin(Role.SUPPORT)).toBe(false);
  });
});
