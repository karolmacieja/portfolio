import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

// Placeholder admin dashboard (metrics arrive in Phase 8), served at admin.{ROOT_DOMAIN}/.
export default async function AdminPage() {
  const user = await requireRole(STAFF_ROLES, "/");
  const t = await getTranslations("admin");
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold" data-testid="admin-title">
        {t("title")}
      </h1>
      <p className="text-muted-foreground">{t("description", { email: user.email, role: user.role })}</p>
    </main>
  );
}
