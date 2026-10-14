import type plMessages from "../../messages/pl.json";

import type { Locale } from "./config";

export type Messages = typeof plMessages;

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}
