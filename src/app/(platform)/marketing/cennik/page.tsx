import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PricingTable } from "@/components/marketing/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pricing");
  return { title: t("title"), description: t("subtitle") };
}

const FAQ = ["trial", "publish", "cancel", "invoices", "domain", "data"] as const;

export default async function PricingPage({ searchParams }: PageProps<"/marketing/cennik">) {
  const { interval } = await searchParams;
  const t = await getTranslations("marketing");
  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-6 py-16">
      <div id="cennik" className="grid gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("pricing.title")}</h1>
        <p className="text-muted-foreground">{t("pricing.subtitle")}</p>
      </div>
      <PricingTable interval={interval === "year" ? "yearly" : "monthly"} basePath="/cennik" />
      <section className="mx-auto grid w-full max-w-3xl gap-4">
        <h2 className="text-2xl font-semibold">{t("faq.title")}</h2>
        {FAQ.map((item) => (
          <details key={item} className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">{t(`faq.${item}.q`)}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{t(`faq.${item}.a`)}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
