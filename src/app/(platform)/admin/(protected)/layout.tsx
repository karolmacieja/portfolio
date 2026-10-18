import { getTranslations } from "next-intl/server";

import { AdminNav, type AdminNavEntry } from "@/components/admin/admin-nav";
import { BrandMark } from "@/components/branding/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";
import { hasPermission, type Permission } from "@/server/auth/permissions";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

type NavKey =
  | "dashboard"
  | "finance"
  | "usage"
  | "clients"
  | "licenses"
  | "sites"
  | "reports"
  | "invoices"
  | "domains"
  | "templates"
  | "coupons"
  | "newsletter"
  | "mailPreview"
  | "plans"
  | "staff"
  | "audit"
  | "branding"
  | "settings";
type NavItem = { href: string; key: NavKey; permission: Permission };
type NavGroupKey = "customers" | "sales" | "content" | "analytics" | "system";

const DASHBOARD: NavItem = { href: "/", key: "dashboard", permission: "clients.view" };

const GROUPS: { key: NavGroupKey; items: NavItem[] }[] = [
  {
    key: "customers",
    items: [
      { href: "/clients", key: "clients", permission: "clients.view" },
      { href: "/licenses", key: "licenses", permission: "licenses.manage" },
      { href: "/sites", key: "sites", permission: "sites.moderate" },
      { href: "/reports", key: "reports", permission: "sites.moderate" },
    ],
  },
  {
    key: "sales",
    items: [
      { href: "/plans", key: "plans", permission: "plans.manage" },
      { href: "/coupons", key: "coupons", permission: "coupons.manage" },
      { href: "/invoices", key: "invoices", permission: "invoices.manage" },
      { href: "/domains", key: "domains", permission: "domains.manage" },
    ],
  },
  {
    key: "content",
    items: [
      { href: "/templates", key: "templates", permission: "templates.manage" },
      { href: "/newsletter", key: "newsletter", permission: "newsletter.manage" },
      { href: "/mail-preview", key: "mailPreview", permission: "settings.manage" },
    ],
  },
  {
    key: "analytics",
    items: [
      { href: "/finance", key: "finance", permission: "finance.view" },
      { href: "/usage", key: "usage", permission: "clients.view" },
    ],
  },
  {
    key: "system",
    items: [
      { href: "/staff", key: "staff", permission: "staff.manage" },
      { href: "/audit", key: "audit", permission: "audit.view" },
      { href: "/branding", key: "branding", permission: "settings.manage" },
      { href: "/settings", key: "settings", permission: "settings.manage" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(STAFF_ROLES, "/");
  const t = await getTranslations("adminNav");
  const allowed = (item: NavItem) => hasPermission(user.role, item.permission);
  const link = (item: NavItem) => ({ href: item.href, label: t(item.key) });

  // Groups the role can't see are dropped; a group with a single visible item becomes a plain link.
  const entries: AdminNavEntry[] = [];
  if (allowed(DASHBOARD)) entries.push(link(DASHBOARD));
  for (const group of GROUPS) {
    const items = group.items.filter(allowed).map(link);
    if (items.length === 1) entries.push(items[0]!);
    else if (items.length > 1) entries.push({ key: group.key, label: t(`groups.${group.key}`), items });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <BrandMark href="/" className="text-base" />
          <AdminNav entries={entries} label={t("label")} />
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
