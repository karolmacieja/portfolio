import { Resend } from "resend";

import type { MailMessage, Mailer } from "./types";

export class ResendMailer implements Mailer {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<void> {
    const { attachments, ...rest } = message;
    const { error } = await this.client.emails.send({
      from: this.from,
      ...rest,
      attachments: attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
      })),
    });
    if (error) throw new Error(`Resend error: ${error.name}: ${error.message}`);
  }
}
