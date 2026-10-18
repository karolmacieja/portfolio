import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { platformCssVars } from "@/lib/brand-colors";
import { getRenderBranding } from "@/server/branding/public";
import { brandNameOf } from "@/server/branding/settings";

import "../globals.css";
import "@/themes/fonts.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getRenderBranding();
  const brand = brandNameOf(branding);
  const icon = (size: string) => branding.favicon[size];
  return {
    title: { default: brand, template: `%s · ${brand}` },
    ...(branding.tagline ? { description: branding.tagline } : {}),
    ...(icon("32")
      ? {
          icons: {
            icon: [
              { url: icon("32")!, sizes: "32x32", type: "image/png" },
              ...(icon("192") ? [{ url: icon("192")!, sizes: "192x192", type: "image/png" }] : []),
            ],
            ...(icon("180") ? { apple: [{ url: icon("180")!, sizes: "180x180" }] } : {}),
          },
        }
      : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, branding] = await Promise.all([getLocale(), getRenderBranding()]);
  return (
    <html lang={locale}>
      {/* Platform colours and font from the admin's branding (see src/lib/brand-colors.ts). */}
      <body className="min-h-dvh" style={platformCssVars(branding)}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
