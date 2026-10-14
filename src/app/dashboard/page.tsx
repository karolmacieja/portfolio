import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { isStaff } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("dashboard") };
}

// Placeholder client dashboard; filled in from Phase 1 onwards.
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const t = await getTranslations();
  const { emailVerified } = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { emailVerified: true },
  });

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="dashboard-title">
          {t("dashboard.title", { name: user.name ?? user.email })}
        </h1>
        <div className="flex items-center gap-2">
          {isStaff(user.role) && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">{t("common.adminPanel")}</Link>
            </Button>
          )}
          <SignOutButton />
        </div>
      </header>
      {!emailVerified && <Alert>{t("auth.emailNotVerified")}</Alert>}
      <p className="text-muted-foreground">{t("dashboard.description")}</p>
    </main>
  );
}
