import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginCard } from "@/components/auth/login-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

// Served at admin.{ROOT_DOMAIN}/login; admin sessions are separate from client sessions.
export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return <LoginCard searchParams={await searchParams} defaultRedirect="/" showRegisterLink={false} />;
}
