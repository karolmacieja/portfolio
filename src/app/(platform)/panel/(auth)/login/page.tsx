import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginCard } from "@/components/auth/login-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/panel/login">) {
  return <LoginCard searchParams={await searchParams} defaultRedirect="/dashboard" showRegisterLink />;
}
