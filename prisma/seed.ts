import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";

import { block, starterContent, type PageContent } from "../src/blocks/content";
import {
  BillingInterval,
  PrismaClient,
  Role,
  SiteStatus,
  SubscriptionStatus,
  SuspensionReason,
  type Prisma,
} from "../src/generated/prisma/client";
import { parseEnv } from "../src/lib/env";
import { hashPassword } from "../src/server/auth/password";
import { DEFAULT_BLOCK_TIERS } from "../src/server/entitlements/rules";
import { processImage } from "../src/server/media/image";
import { createStorage } from "../src/server/storage";
import { THEME_PRESETS } from "../src/themes/theme";
import { seedTemplates } from "./seed-templates";

/**
 * Development seed. Idempotent: safe to run repeatedly.
 */

const DEV_PASSWORD = process.env.SEED_PASSWORD || "Password123!";

/** Seed plans (owner-approved defaults; editable in the admin panel). Prices are gross PLN in grosze. */
const plans = [
  {
    slug: "start",
    name: "Start",
    description: "Portfolio na subdomenie — wszystko, czego potrzebujesz na start.",
    maxSites: 1,
    maxPagesPerSite: 5,
    maxProjects: 30,
    storageMb: 500,
    features: {},
    accessTiers: ["basic"],
    prices: { MONTH: 1900, YEAR: 19000 },
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Własna domena, bez brandingu i więcej miejsca na projekty.",
    maxSites: 3,
    maxPagesPerSite: 20,
    maxProjects: 150,
    storageMb: 5120,
    features: { customDomain: true, removeBranding: true, analytics: true },
    accessTiers: ["basic", "pro"],
    prices: { MONTH: 3900, YEAR: 39000 },
  },
  {
    slug: "business",
    name: "Business",
    description: "Wszystkie funkcje, zakup domeny i bez limitu projektów.",
    maxSites: 10,
    maxPagesPerSite: 50,
    maxProjects: null,
    storageMb: 20480,
    features: {
      customDomain: true,
      domainPurchase: true,
      removeBranding: true,
      analytics: true,
      formsExport: true,
    },
    accessTiers: ["basic", "pro", "business"],
    prices: { MONTH: 7900, YEAR: 79000 },
  },
] as const;

/** One test client per plan plus one without a subscription; client@ (demo sites, E2E) is on Business. */
const users: { email: string; name: string; role: Role; plan?: (typeof plans)[number]["slug"] }[] = [
  { email: "admin@example.com", name: "Admin", role: Role.ADMIN },
  { email: "support@example.com", name: "Support", role: Role.SUPPORT },
  { email: "client@example.com", name: "Jan Kowalski", role: Role.CLIENT, plan: "business" },
  { email: "start@example.com", name: "Klient Start", role: Role.CLIENT, plan: "start" },
  { email: "pro@example.com", name: "Klient Pro", role: Role.CLIENT, plan: "pro" },
  { email: "business@example.com", name: "Klient Business", role: Role.CLIENT, plan: "business" },
  { email: "free@example.com", name: "Klient bez planu", role: Role.CLIENT },
];

async function seedPlans(db: PrismaClient) {
  for (const [position, { prices, features, ...plan }] of plans.entries()) {
    const data = { ...plan, accessTiers: [...plan.accessTiers], features: json(features), position };
    const saved = await db.plan.upsert({ where: { slug: plan.slug }, update: data, create: data });
    for (const [interval, amount] of Object.entries(prices) as [BillingInterval, number][]) {
      await db.planPrice.upsert({
        where: { planId_interval_currency: { planId: saved.id, interval, currency: "PLN" } },
        update: { amount, isActive: true },
        create: { planId: saved.id, interval, amount, currency: "PLN" },
      });
    }
  }
  for (const [blockType, requiredTier] of Object.entries(DEFAULT_BLOCK_TIERS)) {
    await db.blockAccess.upsert({ where: { blockType }, update: {}, create: { blockType, requiredTier } });
  }
}

/** Gives the user a manual (non-Stripe) active monthly subscription to the plan, replacing earlier seed ones. */
async function seedSubscription(db: PrismaClient, userId: string, planSlug: string) {
  const plan = await db.plan.findUniqueOrThrow({ where: { slug: planSlug }, include: { prices: true } });
  const price = plan.prices.find((p) => p.interval === BillingInterval.MONTH);
  await db.subscription.deleteMany({ where: { userId, stripeSubscriptionId: null } });
  await db.subscription.create({
    data: {
      userId,
      planId: plan.id,
      priceId: price?.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

const json = (value: unknown) => value as Prisma.InputJsonObject;

/** Generates a soft gradient placeholder photo, stores it like an upload and records the asset. */
async function demoImage(
  db: PrismaClient,
  ownerId: string,
  name: string,
  colors: [string, string],
  size: [number, number],
) {
  const key = `u/${ownerId}/seed-${name}.webp`;
  const existing = await db.asset.findUnique({ where: { key } });
  if (existing)
    return {
      url: existing.url,
      alt: name,
      width: existing.width ?? undefined,
      height: existing.height ?? undefined,
    };

  const [width, height] = size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/>
    </linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const processed = await processImage(await sharp(Buffer.from(svg)).jpeg().toBuffer());
  const storage = createStorage(parseEnv(process.env));
  const thumbKey = key.replace(/\.webp$/, "-thumb.webp");
  await storage.put(key, processed.main.buffer, processed.contentType);
  await storage.put(thumbKey, processed.thumb.buffer, processed.contentType);
  const asset = await db.asset.create({
    data: {
      ownerId,
      key,
      url: storage.publicUrl(key),
      thumbUrl: storage.publicUrl(thumbKey),
      contentType: processed.contentType,
      sizeBytes: processed.main.buffer.byteLength + processed.thumb.buffer.byteLength,
      width: processed.main.width,
      height: processed.main.height,
      originalName: `${name}.jpg`,
    },
  });
  return { url: asset.url, alt: name, width: processed.main.width, height: processed.main.height };
}

async function janPages(
  db: PrismaClient,
  ownerId: string,
): Promise<{ path: string; title: string; content: PageContent }[]> {
  const portrait = await demoImage(db, ownerId, "portret", ["#d6c7b0", "#7c5e45"], [900, 1100]);
  const photos = await Promise.all(
    (
      [
        ["miasto", ["#94a3b8", "#1e293b"], [1600, 1000]],
        ["las", ["#bbf7d0", "#14532d"], [1000, 1400]],
        ["morze", ["#bae6fd", "#0c4a6e"], [1600, 900]],
        ["pustynia", ["#fde68a", "#9a3412"], [1200, 1200]],
        ["noc", ["#6366f1", "#0f172a"], [1000, 1500]],
        ["mgla", ["#e5e7eb", "#6b7280"], [1600, 1100]],
      ] as const
    ).map(([name, colors, size]) => demoImage(db, ownerId, name, [...colors], [...size])),
  );

  const home: PageContent = {
    root: { props: {} },
    content: [
      block("Hero", {
        title: "Jan Kowalski",
        subtitle: "Fotograf · Warszawa\nPortrety, architektura i miasto.",
        align: "left",
        image: { ...photos[0]!, alt: "Miasto nocą" },
        buttonLabel: "Zobacz projekty",
        buttonHref: "/projekty",
      }),
      block("About", {
        heading: "O mnie",
        text: "Od ponad 10 lat fotografuję ludzi i przestrzeń. Pracuję dla magazynów, pracowni architektonicznych i marek.\n\nTo jest strona demo z seeda.",
        image: { ...portrait, alt: "Portret Jana" },
        imagePosition: "right",
      }),
      block("ProjectList", {
        heading: "Wybrane projekty",
        columns: "3",
        items: photos.slice(1, 4).map((image, index) => ({
          title: ["Las", "Morze", "Pustynia"][index]!,
          description: "Seria zdjęć, 2025",
          image,
          href: "/projekty",
        })),
      }),
      block("Skills", {
        heading: "Specjalizacje",
        style: "tags",
        items: ["Portret", "Architektura", "Reportaż", "Retusz", "Lightroom", "Fotografia produktowa"].map(
          (name) => ({
            name,
            level: 80,
          }),
        ),
      }),
      block("Timeline", {
        heading: "Doświadczenie",
        items: [
          {
            period: "2020 – obecnie",
            title: "Fotograf freelance",
            organization: "Własna działalność",
            description: "Sesje dla marek i pracowni architektonicznych.",
          },
          { period: "2015 – 2020", title: "Fotoreporter", organization: "Gazeta Miejska", description: "" },
        ],
      }),
      block("Testimonials", {
        heading: "Opinie",
        items: [
          {
            quote: "Świetne wyczucie światła i przestrzeni.",
            author: "Anna Nowak",
            role: "Studio Architektury",
          },
          {
            quote: "Profesjonalnie, szybko i z pomysłem.",
            author: "Piotr Wiśniewski",
            role: "Magazyn Miasto",
          },
        ],
      }),
      block("SocialLinks", {
        heading: "Znajdziesz mnie tutaj",
        align: "center",
        items: [
          { platform: "instagram", url: "https://instagram.com/" },
          { platform: "behance", url: "https://behance.net/" },
          { platform: "email", url: "mailto:jan@example.com" },
        ],
      }),
    ],
  };

  const projects: PageContent = {
    root: { props: {} },
    content: [
      block("Text", { heading: "Projekty", text: "Wybór serii z ostatnich lat.", align: "center" }),
      block("Gallery", {
        heading: "",
        layout: "masonry",
        columns: "3",
        images: photos.map((image, index) => ({ image, caption: `Kadr ${index + 1}` })),
      }),
      block("Project", {
        title: "Miasto nocą",
        subtitle: "Seria autorska, 2024",
        description: "Długie naświetlania w centrum Warszawy.",
        images: [{ image: photos[4]! }, { image: photos[0]! }, { image: photos[5]! }],
        linkLabel: "Napisz do mnie",
        linkHref: "mailto:jan@example.com",
      }),
    ],
  };

  return [
    { path: "", title: "Jan Kowalski", content: home },
    { path: "projekty", title: "Projekty", content: projects },
  ];
}

async function main() {
  const env = parseEnv(process.env);
  if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
    throw new Error("Refusing to seed production with the default password; set SEED_PASSWORD");
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try {
    await seedPlans(db);
    const passwordHash = await hashPassword(DEV_PASSWORD);
    for (const { plan, ...user } of users) {
      const saved = await db.user.upsert({
        where: { email: user.email },
        update: { role: user.role, name: user.name, passwordHash },
        create: { ...user, passwordHash, emailVerified: new Date() },
      });
      if (plan) await seedSubscription(db, saved.id, plan);
      else await db.subscription.deleteMany({ where: { userId: saved.id, stripeSubscriptionId: null } });
    }

    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const templateCount = await seedTemplates(db, env, admin.id, (name, colors, size) =>
      demoImage(db, admin.id, name, colors, size),
    );

    const client = await db.user.findUniqueOrThrow({ where: { email: "client@example.com" } });
    const now = new Date();
    const sites = [
      {
        slug: "jan",
        name: "Jan Kowalski",
        status: SiteStatus.ACTIVE,
        theme: THEME_PRESETS.editorial,
        description: "Jan Kowalski — fotograf z Warszawy.",
        pages: await janPages(db, client.id),
      },
      {
        slug: "zawieszona",
        name: "Strona zawieszona",
        status: SiteStatus.SUSPENDED,
        theme: null,
        description: null,
        pages: [
          {
            path: "",
            title: "Zawieszona",
            content: starterContent({
              title: "Zawieszona",
              subtitle: "",
              body: "Tej treści nie powinno być widać.",
            }),
          },
        ],
      },
    ];

    for (const site of sites) {
      const suspension =
        site.status === SiteStatus.SUSPENDED
          ? { suspensionReason: SuspensionReason.PAYMENT, suspendedAt: now }
          : { suspensionReason: null, suspendedAt: null };
      const data = {
        name: site.name,
        status: site.status,
        publishedAt: now,
        description: site.description,
        themeDraft: site.theme ? json(site.theme) : undefined,
        themePublished: site.theme ? json(site.theme) : undefined,
        ...suspension,
      };
      const saved = await db.site.upsert({
        where: { slug: site.slug },
        update: data,
        create: { ownerId: client.id, slug: site.slug, ...data },
      });
      for (const [position, page] of site.pages.entries()) {
        const content = json(page.content);
        const pageData = {
          title: page.title,
          position,
          draftContent: content,
          publishedContent: content,
          publishedAt: now,
          draftUpdatedAt: now,
        };
        await db.page.upsert({
          where: { siteId_path: { siteId: saved.id, path: page.path } },
          update: pageData,
          create: { siteId: saved.id, path: page.path, ...pageData },
        });
      }
    }

    console.info(
      `Seeded ${plans.length} plans, ${users.length} users (password: ${process.env.SEED_PASSWORD ? "<SEED_PASSWORD>" : DEV_PASSWORD}) ` +
        `${templateCount} templates and ${sites.length} demo sites (${sites.map((s) => s.slug).join(", ")})`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
