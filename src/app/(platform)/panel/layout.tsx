import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { endImpersonationAction } from "@/server/admin/impersonation-actions";
import { getCurrentUser } from "@/server/auth/session";

/** Client panel: while staff act as the client, every page shows who is acting and a way out. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.impersonation) return children;
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
      {children}
    </>
  );
}
