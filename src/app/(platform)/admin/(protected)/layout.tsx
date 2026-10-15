import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";
import { hasPermission, type Permission } from "@/server/auth/permissions";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

const NAV: { href: string; key: string; permission: Permission }[] = [
  { href: "/", key: "dashboard", permission: "clients.view" },
  { href: "/finance", key: "finance", permission: "finance.view" },
  { href: "/usage", key: "usage", permission: "clients.view" },
  { href: "/clients", key: "clients", permission: "clients.view" },
  { href: "/licenses", key: "licenses", permission: "licenses.manage" },
  { href: "/sites", key: "sites", permission: "sites.moderate" },
  { href: "/reports", key: "reports", permission: "sites.moderate" },
  { href: "/invoices", key: "invoices", permission: "invoices.manage" },
  { href: "/domains", key: "domains", permission: "domains.manage" },
  { href: "/templates", key: "templates", permission: "templates.manage" },
  { href: "/coupons", key: "coupons", permission: "coupons.manage" },
  { href: "/newsletter", key: "newsletter", permission: "newsletter.manage" },
  { href: "/plans", key: "plans", permission: "plans.manage" },
  { href: "/staff", key: "staff", permission: "staff.manage" },
  { href: "/audit", key: "audit", permission: "audit.view" },
  { href: "/settings", key: "settings", permission: "settings.manage" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(STAFF_ROLES, "/");
  const t = await getTranslations("adminNav");
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
            {NAV.filter((item) => hasPermission(user.role, item.permission)).map((item) => (
              <Link key={item.href} href={item.href}>
                {t(item.key as "dashboard")}
              </Link>
            ))}
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
