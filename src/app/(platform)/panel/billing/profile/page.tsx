import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { BillingProfileForm } from "@/components/billing/billing-forms";
import { requireUser } from "@/server/auth/session";
import { getBillingProfile } from "@/server/billing/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("profile") };
}

export default async function BillingProfilePage({ searchParams }: PageProps<"/panel/billing/profile">) {
  const user = await requireUser("/billing/profile");
  const { next } = await searchParams;
  const [profile, t] = await Promise.all([getBillingProfile(user.id), getTranslations("billing")]);
  // Only same-host relative paths are accepted as the post-save destination.
  const safeNext = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;

  return (
    <main className="mx-auto grid max-w-2xl gap-6 px-6 py-8">
      <Link href="/billing" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("profile")}</h1>
      <BillingProfileForm
        next={safeNext}
        initial={{
          type: profile?.type ?? "PERSON",
          fullName: profile?.fullName ?? user.name ?? "",
          companyName: profile?.companyName ?? "",
          taxId: profile?.taxId ?? "",
          euVatId: profile?.euVatId ?? "",
          line1: profile?.line1 ?? "",
          line2: profile?.line2 ?? "",
          postalCode: profile?.postalCode ?? "",
          city: profile?.city ?? "",
          country: profile?.country ?? "PL",
        }}
      />
    </main>
  );
}
