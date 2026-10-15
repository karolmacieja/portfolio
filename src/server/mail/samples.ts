import "server-only";

import { getEnv, platformUrl } from "@/lib/env";

import { buildLinkMail, type LINK_MAIL_KINDS } from "./templates";

/** Sample values so every placeholder shows something in previews and test mails. */
export async function sampleMail(kind: (typeof LINK_MAIL_KINDS)[number], locale: "pl" | "en", to: string) {
  return buildLinkMail({
    kind,
    to,
    url: platformUrl("app", "/dashboard"),
    locale,
    brand: getEnv().BRAND_NAME,
    values: {
      days: 7,
      number: "FV/12/10/2026",
      domain: "jan-kowalski.pl",
      reason: "Przykładowe uzasadnienie.",
      name: "Anna",
      email: "anna@example.com",
    },
    ...(kind === "contactMessage" ? { quote: "Dzień dobry, chciałabym zamówić sesję zdjęciową." } : {}),
  });
}
