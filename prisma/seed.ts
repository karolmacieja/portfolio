import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Plans, templates and per-plan test clients are added in Phases 3-4.
 */

const DEV_PASSWORD = process.env.SEED_PASSWORD || "Password123!";

const users: { email: string; name: string; role: Role }[] = [
  { email: "admin@example.com", name: "Admin", role: Role.ADMIN },
  { email: "support@example.com", name: "Support", role: Role.SUPPORT },
  { email: "client@example.com", name: "Jan Kowalski", role: Role.CLIENT },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
    throw new Error("Refusing to seed production with the default password; set SEED_PASSWORD");
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    for (const user of users) {
      await db.user.upsert({
        where: { email: user.email },
        update: { role: user.role, name: user.name, passwordHash },
        create: { ...user, passwordHash, emailVerified: new Date() },
      });
    }
    console.info(
      `Seeded ${users.length} users (password: ${process.env.SEED_PASSWORD ? "<SEED_PASSWORD>" : DEV_PASSWORD})`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
