import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";

import { MockMailer } from "./mock";
import { ResendMailer } from "./resend";
import { SmtpMailer } from "./smtp";
import type { Mailer } from "./types";

export type { MailMessage, Mailer } from "./types";

/** Addresses of erased accounts (see account/deletion.ts); never mailed. */
export const ERASED_EMAIL_DOMAIN = "deleted.invalid";

/** Drops mails to erased accounts, whatever job still refers to them. */
class ErasedAddressFilter implements Mailer {
  constructor(private readonly inner: Mailer) {}
  get name() {
    return this.inner.name;
  }
  async send(message: Parameters<Mailer["send"]>[0]) {
    if (message.to.toLowerCase().endsWith(`@${ERASED_EMAIL_DOMAIN}`)) return;
    await this.inner.send(message);
  }
}

export function createMailer(env: Env): Mailer {
  return new ErasedAddressFilter(createProviderMailer(env));
}

function createProviderMailer(env: Env): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "smtp":
      return new SmtpMailer({
        host: env.SMTP_HOST!,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.MAIL_FROM,
      });
    case "resend":
      return new ResendMailer(env.RESEND_API_KEY!, env.MAIL_FROM);
    case "mock":
      return new MockMailer();
  }
}

const globalForMailer = globalThis as unknown as { mailer?: Mailer };

export function getMailer(): Mailer {
  globalForMailer.mailer ??= createMailer(getEnv());
  return globalForMailer.mailer;
}
