import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { getEnv } from "@/lib/env";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const brand = getEnv().BRAND_NAME;
  return { title: { default: brand, template: `%s · ${brand}` } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
