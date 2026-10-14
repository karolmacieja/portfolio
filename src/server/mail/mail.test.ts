import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

import { createMailer } from "./index";
import { MockMailer } from "./mock";
import { buildLinkMail } from "./templates";

const env = parseEnv({
  ROOT_DOMAIN: "localhost:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
});

describe("createMailer", () => {
  it("selects the implementation from MAIL_PROVIDER", () => {
    expect(createMailer(env).name).toBe("mock");
    expect(createMailer({ ...env, MAIL_PROVIDER: "smtp", SMTP_HOST: "localhost" }).name).toBe("smtp");
    expect(createMailer({ ...env, MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test" }).name).toBe("resend");
  });
});

describe("MockMailer", () => {
  it("records sent messages", async () => {
    const mailer = new MockMailer(() => {});
    await mailer.send({ to: "a@b.pl", subject: "Hi", text: "t", html: "<p>t</p>" });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("a@b.pl");
  });
});

describe("buildLinkMail", () => {
  it("renders a localized magic link mail", async () => {
    const mail = await buildLinkMail({
      kind: "magicLink",
      to: "a@b.pl",
      url: "http://app.localhost:3000/api/auth/callback/email?token=abc",
      locale: "pl",
      brand: "Folio",
    });
    expect(mail.subject).toBe("Zaloguj się do Folio");
    expect(mail.text).toContain("token=abc");
  });

  it("escapes the URL in the HTML body", async () => {
    const mail = await buildLinkMail({
      kind: "verifyEmail",
      to: "a@b.pl",
      url: 'http://x/?a=1&b="><script>',
      locale: "en",
      brand: "Folio",
    });
    expect(mail.subject).toBe("Confirm your email for Folio");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&amp;b=&quot;&gt;&lt;script&gt;");
  });
});
