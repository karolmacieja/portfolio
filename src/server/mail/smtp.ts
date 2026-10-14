import nodemailer, { type Transporter } from "nodemailer";

import type { MailMessage, Mailer } from "./types";

export type SmtpConfig = { host: string; port: number; user?: string; password?: string; from: string };

export class SmtpMailer implements Mailer {
  readonly name = "smtp";
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...message });
  }
}
