import "dotenv/config";

import pg from "pg";

/** Direct database access for E2E fixtures (users with a known password, premium flags). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/**
 * Creates a verified client with no plan (password as the seed users, copied from free@) and,
 * optionally, a billing profile. Removed by global-setup on the next run (`e2e-%@example.com`).
 */
export async function createBillingUser(
  options: { profile?: boolean; name?: string; plan?: "start" | "pro" | "business" } = {},
): Promise<string> {
  const name = options.name ?? "Klient E2E";
  const email = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const [user] = await sql<{ id: string }>(
    `INSERT INTO "User" (id, email, name, "passwordHash", "emailVerified", "updatedAt")
     SELECT gen_random_uuid()::text, $1, $2, "passwordHash", now(), now()
     FROM "User" WHERE email = 'free@example.com' RETURNING id`,
    [email, name],
  );
  if (!user) throw new Error("Seed user free@example.com is missing (run pnpm db:seed)");
  if (options.profile) {
    await sql(
      `INSERT INTO "BillingProfile" (id, "userId", type, "fullName", line1, "postalCode", city, country, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'PERSON', $2, 'Testowa 1', '00-001', 'Warszawa', 'PL', now())`,
      [user.id, name],
    );
  }
  if (options.plan) {
    await sql(
      `INSERT INTO "Subscription" (id, "userId", "planId", status, "updatedAt")
       SELECT gen_random_uuid()::text, $1, id, 'ACTIVE', now() FROM "Plan" WHERE slug = $2`,
      [user.id, options.plan],
    );
  }
  return email;
}

/** Clones the published seed template "fotograf" as a premium e2e template; returns its slug. */
export async function createPremiumTemplate(priceAmount: number): Promise<string> {
  const slug = `e2e-premium-${Date.now().toString(36)}`;
  const [template] = await sql<{ id: string }>(
    `INSERT INTO "Template" (id, slug, name, description, category, tags, "accessTier", status, "thumbnailUrl",
       position, "isNew", "isFeatured", "isPremium", "priceAmount", draft, "updatedAt")
     SELECT gen_random_uuid()::text, $1, 'Premium E2E', description, category, tags, 'basic', status,
       "thumbnailUrl", position, false, false, true, $2, draft, now()
     FROM "Template" WHERE slug = 'fotograf' RETURNING id`,
    [slug, priceAmount],
  );
  if (!template) throw new Error("Seed template 'fotograf' is missing (run pnpm db:seed)");
  await sql(
    `WITH version AS (
       INSERT INTO "TemplateVersion" (id, "templateId", number, pages, theme, "createdById")
       SELECT gen_random_uuid()::text, $1, 1, v.pages, v.theme, v."createdById"
       FROM "TemplateVersion" v JOIN "Template" t ON t."publishedVersionId" = v.id WHERE t.slug = 'fotograf'
       RETURNING id)
     UPDATE "Template" SET "publishedVersionId" = (SELECT id FROM version) WHERE id = $1`,
    [template.id],
  );
  return slug;
}
