import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { starterContent } from "../src/blocks/content";
import {
  PrismaClient,
  Role,
  SiteStatus,
  SuspensionReason,
  type Prisma,
} from "../src/generated/prisma/client";
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

const demoSites = [
  {
    slug: "jan",
    name: "Jan Kowalski",
    status: SiteStatus.ACTIVE,
    content: starterContent({
      title: "Jan Kowalski",
      subtitle: "Fotograf · Warszawa",
      body: "Fotografuję ludzi, architekturę i miasto. To jest strona demo z seeda.",
    }),
  },
  {
    slug: "zawieszona",
    name: "Strona zawieszona",
    status: SiteStatus.SUSPENDED,
    content: starterContent({ title: "Zawieszona", subtitle: "", body: "Tej treści nie powinno być widać." }),
  },
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

    const client = await db.user.findUniqueOrThrow({ where: { email: "client@example.com" } });
    const now = new Date();
    for (const site of demoSites) {
      const content = site.content as unknown as Prisma.InputJsonObject;
      const suspension =
        site.status === SiteStatus.SUSPENDED
          ? { suspensionReason: SuspensionReason.PAYMENT, suspendedAt: now }
          : { suspensionReason: null, suspendedAt: null };
      const saved = await db.site.upsert({
        where: { slug: site.slug },
        update: { name: site.name, status: site.status, publishedAt: now, ...suspension },
        create: {
          ownerId: client.id,
          slug: site.slug,
          name: site.name,
          status: site.status,
          publishedAt: now,
          ...suspension,
        },
      });
      await db.page.upsert({
        where: { siteId_path: { siteId: saved.id, path: "" } },
        update: { draftContent: content, publishedContent: content, publishedAt: now, updatedAt: now },
        create: {
          siteId: saved.id,
          path: "",
          title: site.name,
          draftContent: content,
          publishedContent: content,
          publishedAt: now,
          updatedAt: now,
        },
      });
    }

    console.info(
      `Seeded ${users.length} users (password: ${process.env.SEED_PASSWORD ? "<SEED_PASSWORD>" : DEV_PASSWORD}) ` +
        `and ${demoSites.length} demo sites (${demoSites.map((s) => s.slug).join(", ")})`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
