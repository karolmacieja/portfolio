import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { BrandMark } from "@/components/branding/brand-mark";
import { ContactLinks } from "@/components/branding/contact-links";
import { Button } from "@/components/ui/button";
import { platformUrl } from "@/lib/env";
import { getRenderBranding } from "@/server/branding/public";
import { brandNameOf } from "@/server/branding/settings";

/** Marketing site (root domain): header with sign-in/registration, footer with legal links. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("marketing");
  const brand = brandNameOf(await getRenderBranding());
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <BrandMark href="/" />
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t("nav.label")}>
            <Button asChild variant="ghost" size="sm">
              <Link href="/#szablony">{t("nav.templates")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/cennik">{t("nav.pricing")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={platformUrl("app", "/login")}>{t("nav.signIn")}</a>
            </Button>
            <Button asChild size="sm">
              <a href={platformUrl("app", "/register")}>{t("nav.register")}</a>
            </Button>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="grid gap-2">
            <p>{t("footer.copyright", { brand, year: new Date().getFullYear() })}</p>
            <ContactLinks />
          </div>
          <nav className="flex flex-wrap gap-4" aria-label={t("footer.label")}>
            <Link href="/cennik" className="hover:underline">
              {t("nav.pricing")}
            </Link>
            <Link href="/regulamin" className="hover:underline">
              {t("footer.terms")}
            </Link>
            <Link href="/polityka-prywatnosci" className="hover:underline">
              {t("footer.privacy")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
