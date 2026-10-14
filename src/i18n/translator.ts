import { createTranslator } from "next-intl";

import { defaultLocale, isLocale, type Locale } from "./config";
import { loadMessages } from "./messages";

/**
 * Translator bound to an explicit locale, for contexts without a request locale:
 * published client sites (site language, no cookies so pages stay static) and emails.
 */
export async function getTranslator(locale: string) {
  const resolved: Locale = isLocale(locale) ? locale : defaultLocale;
  const messages = await loadMessages(resolved);
  return createTranslator({ locale: resolved, messages });
}
