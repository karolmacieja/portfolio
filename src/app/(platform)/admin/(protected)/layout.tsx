import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(STAFF_ROLES, "/");
  const t = await getTranslations("adminNav");
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/">{t("dashboard")}</Link>
            {user.role === "ADMIN" && (
              <>
                <Link href="/templates">{t("templates")}</Link>
                <Link href="/coupons">{t("coupons")}</Link>
              </>
            )}
            <Link href="/invoices">{t("invoices")}</Link>
            {user.role === "ADMIN" && <Link href="/settings">{t("settings")}</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            {user.email}
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
