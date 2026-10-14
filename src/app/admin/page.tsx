import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

// Placeholder admin panel; served from admin.{ROOT_DOMAIN} once host routing lands (Phase 1).
export default async function AdminPage() {
  const user = await requireRole(STAFF_ROLES, "/admin");
  const t = await getTranslations("admin");
  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="admin-title">
          {t("title")}
        </h1>
        <SignOutButton />
      </header>
      <p className="text-muted-foreground">{t("description", { email: user.email, role: user.role })}</p>
    </main>
  );
}
