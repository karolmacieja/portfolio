import NextAuth from "next-auth";

import { buildAuthConfig } from "@/server/auth/config";

// Lazy config: env is validated on the first request, not at build time.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(() => buildAuthConfig());
