export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

/** Transactional mail adapter. Implementations: mock (dev/test), SMTP (Mailpit locally), Resend (production). */
export interface Mailer {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}
