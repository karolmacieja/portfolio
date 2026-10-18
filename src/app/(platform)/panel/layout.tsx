import { getFormatter, getTranslations } from "next-intl/server";

import { BrandMark } from "@/components/branding/brand-mark";
import { ContactLinks } from "@/components/branding/contact-links";
import { Button } from "@/components/ui/button";
import { endImpersonationAction } from "@/server/admin/impersonation-actions";
import { getCurrentUser } from "@/server/auth/session";

/** Client panel: while staff act as the client, every page shows who is acting and a way out. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // The platform brand above every signed-in panel page (the full-screen editor hides it, see globals.css).
  const brandBar = user ? (
    <div className="border-b" data-brandbar>
      <div className="mx-auto flex max-w-6xl items-center px-6 py-2">
        <BrandMark href="/dashboard" className="text-base" />
      </div>
    </div>
  ) : null;
  const footer = user ? (
    <footer className="border-t text-sm text-muted-foreground" data-brandbar>
      <div className="mx-auto max-w-6xl px-6 py-4">
        <ContactLinks />
      </div>
    </footer>
  ) : null;
  if (!user?.impersonation)
    return (
      <>
        {brandBar}
        {children}
        {footer}
      </>
    );
  const [t, format] = await Promise.all([getTranslations("impersonation"), getFormatter()]);
  const until = format.dateTime(new Date(user.impersonation.expiresAt), { timeStyle: "short" });
  return (
    <>
      <div
        role="status"
        className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm text-black"
        data-testid="impersonation-banner"
      >
        <span>{t("banner", { email: user.email, admin: user.impersonation.adminEmail, until })}</span>
        <form action={endImpersonationAction}>
          <Button type="submit" size="sm" variant="outline" className="h-7 border-black bg-transparent">
            {t("end")}
          </Button>
        </form>
      </div>
      {brandBar}
      {children}
      {footer}
    </>
  );
}
