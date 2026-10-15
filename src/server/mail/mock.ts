import type { MailMessage, Mailer } from "./types";

/** Keeps sent messages in memory and logs them; used in tests and when no mail server is available. */
export class MockMailer implements Mailer {
  readonly name = "mock";
  readonly sent: MailMessage[] = [];

  constructor(private readonly log: (line: string) => void = console.info) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    const files = message.attachments
      ?.map((file) => `${file.filename} (${file.content.length} B)`)
      .join(", ");
    this.log(
      `[mail:mock] to=${message.to} subject="${message.subject}"${files ? ` attachments=${files}` : ""}\n${message.text}`,
    );
  }
}
