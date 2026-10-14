import { z } from "zod";

/**
 * Single source of truth for runtime configuration. Every variable read by the app
 * must be declared here and documented in `.env.example`.
 */

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Deployment stage, independent of NODE_ENV (a local `next start` is NODE_ENV=production).
    // In APP_ENV=production mock integrations are refused.
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),

    ROOT_DOMAIN: z
      .string()
      .min(1)
      .regex(/^[a-z0-9.-]+(:\d+)?$/, "ROOT_DOMAIN must be a bare host, optionally with a port"),
    APP_PROTOCOL: z.enum(["http", "https"]).default("https"),
    BRAND_NAME: z.string().min(1).default("Portfolio"),

    // Number of reverse proxies in front of the app whose X-Forwarded-For entries are trusted.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,

    MAIL_PROVIDER: z.enum(["mock", "smtp", "resend"]).default("mock"),
    MAIL_FROM: z.string().min(3).default("Portfolio <no-reply@localhost>"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    RESEND_API_KEY: optionalString,

    // local: files on disk served by /storage/* (development); s3: MinIO / Cloudflare R2.
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().min(1).default(".storage"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().min(1).default("auto"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_PUBLIC_URL: optionalString,
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    UPLOAD_MAX_MB: z.coerce.number().positive().max(100).default(15),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_PROVIDER === "smtp" && !env.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "Required when MAIL_PROVIDER=smtp" });
    }
    if (env.MAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Required when MAIL_PROVIDER=resend",
      });
    }
    if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GOOGLE_SECRET"],
        message: "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together",
      });
    }
    if (env.STORAGE_PROVIDER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const) {
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: "Required when STORAGE_PROVIDER=s3" });
      }
    }
    if (env.APP_ENV === "production" && env.STORAGE_PROVIDER === "local") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_PROVIDER"],
        message: "local storage is not allowed in production",
      });
    }
    if (env.APP_ENV === "production" && env.MAIL_PROVIDER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_PROVIDER"],
        message: "mock mailer is not allowed in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazily validated env, so `next build` and tooling don't need runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Public base URL of a given host on the platform, e.g. `appUrl("app")`. */
export function platformUrl(subdomain?: string, path = "/"): string {
  const { APP_PROTOCOL, ROOT_DOMAIN } = getEnv();
  const host = subdomain ? `${subdomain}.${ROOT_DOMAIN}` : ROOT_DOMAIN;
  return `${APP_PROTOCOL}://${host}${path}`;
}
