import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React Server environment; it is a no-op under test.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    clearMocks: true,
    // Loads .env (and .env.test / .env.test.local overrides) so DB/Redis-backed tests can run locally.
    // Point DATABASE_URL at a separate database in .env.test.local to keep dev data apart.
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
