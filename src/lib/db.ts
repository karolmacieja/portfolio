import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily-connected Prisma client: env is read on first use, so `next build` and
 * importing modules never require a database configuration.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
