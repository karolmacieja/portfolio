import type { DefaultSession } from "next-auth";

import type { Role } from "@/generated/prisma/enums";

/** Present while staff act as a client (see src/server/admin/impersonation.ts). */
export type ImpersonationClaim = { sessionId: string; adminEmail: string; expiresAt: number };

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      locale: string;
      impersonation?: ImpersonationClaim;
    } & DefaultSession["user"];
  }
  interface User {
    impersonation?: ImpersonationClaim;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    locale?: string;
    refreshedAt?: number;
    impersonation?: ImpersonationClaim;
  }
}
