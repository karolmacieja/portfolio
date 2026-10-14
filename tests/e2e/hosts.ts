const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.E2E_ROOT_DOMAIN ?? `localhost:${PORT}`;

/** Absolute URL on a platform host; *.localhost resolves to loopback in Chromium. */
export const hostUrl = (subdomain: string | null, path = "/") =>
  `http://${subdomain ? `${subdomain}.` : ""}${ROOT}${path}`;

export const appUrl = (path = "/") => hostUrl("app", path);
export const adminUrl = (path = "/") => hostUrl("admin", path);
export const siteUrl = (slug: string, path = "/") => hostUrl(slug, path);

// Seeded by prisma/seed.ts.
export const PASSWORD = process.env.SEED_PASSWORD || "Password123!";
