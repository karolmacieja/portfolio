import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";

import { hasPermission, PERMISSIONS } from "./permissions";

describe("hasPermission", () => {
  it("gives ADMIN everything and SUPPORT all but roles, settings and the plan catalog", () => {
    for (const permission of PERMISSIONS) expect(hasPermission(Role.ADMIN, permission)).toBe(true);
    expect(PERMISSIONS.filter((p) => !hasPermission(Role.SUPPORT, p))).toEqual([
      "finance.view",
      "plans.manage",
      "settings.manage",
      "staff.manage",
    ]);
    expect(hasPermission(Role.SUPPORT, "payments.refund")).toBe(true);
    expect(hasPermission(Role.CLIENT, "clients.view")).toBe(false);
    expect(hasPermission(null, "clients.view")).toBe(false);
  });
});
