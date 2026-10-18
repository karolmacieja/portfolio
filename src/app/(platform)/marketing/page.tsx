import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PricingTable } from "@/components/marketing/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { platformUrl } from "@/lib/env";
import { getLandingTexts } from "@/server/branding/landing";
import { getRenderBranding } from "@/server/branding/public";
import { brandNameOf } from "@/server/branding/settings";

export async function generateMetadata(): Promise<Metadata> {
  const [text, branding] = await Promise.all([getLandingTexts(), getRenderBranding()]);
  return {
    title: { absolute: `${brandNameOf(branding)} — ${text("home.title")}` },
    description: branding.tagline || text("home.subtitle"),
  };
}

const FEATURES = ["editor", "templates", "domain", "stats", "contact", "invoices"] as const;
const STEPS = ["account", "template", "publish"] as const;

/** Landing page: hero, features, template showcase, steps, pricing. */
export default async function HomePage({ searchParams }: PageProps<"/marketing">) {
  const { interval } = await searchParams;
  const t = await getTranslations();
  const text = await getLandingTexts();
  const templates = await db.template.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ isFeatured: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    take: 6,
    select: { slug: true, name: true, description: true, thumbnailUrl: true, isPremium: true, isNew: true },
  });

  return (
    <main>
      <section className="mx-auto grid max-w-4xl justify-items-center gap-6 px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl" data-testid="home-title">
          {text("home.title")}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{text("home.subtitle")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a href={platformUrl("app", "/register")}>{text("home.cta")}</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/cennik">{t("marketing.hero.pricing")}</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{text("marketing.hero.note")}</p>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16">
          <h2 className="text-center text-3xl font-semibold">{text("marketing.features.title")}</h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="grid gap-2 rounded-lg border bg-background p-6">
                <h3 className="font-semibold">{text(`marketing.features.${feature}.title`)}</h3>
                <p className="text-sm text-muted-foreground">{text(`marketing.features.${feature}.text`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {templates.length > 0 && (
        <section id="szablony" className="mx-auto grid max-w-6xl scroll-mt-8 gap-8 px-6 py-16">
          <div className="grid gap-2 text-center">
            <h2 className="text-3xl font-semibold">{text("marketing.templates.title")}</h2>
            <p className="text-muted-foreground">{text("marketing.templates.subtitle")}</p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="home-templates">
            {templates.map((template) => (
              <li key={template.slug} className="overflow-hidden rounded-lg border">
                <a
                  href={`/template-preview/${template.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group grid"
                >
                  <div className="aspect-[4/3] bg-muted">
                    {template.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={template.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover object-top transition group-hover:opacity-90"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="grid gap-1 p-4">
                    <p className="flex items-center gap-2 font-medium">
                      {template.name}
                      {template.isNew && <Badge variant="secondary">{t("marketing.templates.new")}</Badge>}
                      {template.isPremium && (
                        <Badge variant="outline">{t("marketing.templates.premium")}</Badge>
                      )}
                    </p>
                    {template.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
                    )}
                    <span className="text-sm underline-offset-4 group-hover:underline">
                      {t("marketing.templates.preview")} →
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-muted/40">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16">
          <h2 className="text-center text-3xl font-semibold">{text("marketing.steps.title")}</h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="grid gap-2 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-brand-accent font-semibold text-brand-accent-foreground">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{text(`marketing.steps.${step}.title`)}</h3>
                <p className="text-sm text-muted-foreground">{text(`marketing.steps.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="cennik" className="mx-auto grid max-w-6xl scroll-mt-8 gap-8 px-6 py-16">
        <h2 className="text-center text-3xl font-semibold">{text("marketing.pricing.title")}</h2>
        <PricingTable interval={interval === "year" ? "yearly" : "monthly"} basePath="/" />
      </section>
    </main>
  );
}
