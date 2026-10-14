import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const base = {
  ROOT_DOMAIN: "localhost:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults for a minimal configuration", () => {
    const env = parseEnv(base);
    expect(env.MAIL_PROVIDER).toBe("mock");
    expect(env.APP_PROTOCOL).toBe("https");
    expect(env.BRAND_NAME).toBe("Portfolio");
    expect(env.SMTP_PORT).toBe(1025);
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "" });
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
  });

  it("rejects a short AUTH_SECRET and lists the failing variable", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects ROOT_DOMAIN with a protocol", () => {
    expect(() => parseEnv({ ...base, ROOT_DOMAIN: "https://example.com" })).toThrow(/ROOT_DOMAIN/);
  });

  it("requires SMTP_HOST for the smtp provider", () => {
    expect(() => parseEnv({ ...base, MAIL_PROVIDER: "smtp" })).toThrow(/SMTP_HOST/);
  });

  it("requires RESEND_API_KEY for the resend provider", () => {
    expect(() => parseEnv({ ...base, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("requires Google credentials to be set together", () => {
    expect(() => parseEnv({ ...base, AUTH_GOOGLE_ID: "id" })).toThrow(/AUTH_GOOGLE_SECRET/);
  });

  it("forbids the mock mailer and local storage when APP_ENV=production", () => {
    expect(() => parseEnv({ ...base, APP_ENV: "production" })).toThrow(/MAIL_PROVIDER/);
    expect(() => parseEnv({ ...base, APP_ENV: "production" })).toThrow(/STORAGE_PROVIDER/);
  });

  it("requires bucket credentials for S3 storage", () => {
    expect(() => parseEnv({ ...base, STORAGE_PROVIDER: "s3" })).toThrow(/S3_BUCKET/);
    const env = parseEnv({
      ...base,
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      S3_PUBLIC_URL: "https://cdn.example.com",
      S3_FORCE_PATH_STYLE: "false",
    });
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it("allows the mock mailer in a local production build", () => {
    expect(parseEnv({ ...base, NODE_ENV: "production" }).MAIL_PROVIDER).toBe("mock");
  });
});
