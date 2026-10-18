import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  BrandColorsForm,
  BrandContactForm,
  BrandIdentityForm,
  LandingTextsForm,
} from "@/components/admin/branding-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { locales } from "@/i18n/config";
import { getTranslator } from "@/i18n/translator";
import { getEnv } from "@/lib/env";
import { requirePermission } from "@/server/auth/session";
import {
  brandNameOf,
  getPlatformBrandingSettings,
  LANDING_TEXT_KEYS,
  type LandingTextKey,
} from "@/server/branding/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminBranding");
  return { title: t("title") };
}

const LANDING_GROUPS = ["hero", "features", "templates", "steps", "pricing", "faq"] as const;

function groupOf(key: LandingTextKey): (typeof LANDING_GROUPS)[number] {
  if (key.startsWith("home.") || key.startsWith("marketing.hero.")) return "hero";
  return key.split(".")[1] as (typeof LANDING_GROUPS)[number];
}

/** Platform branding (ADMIN): name, logo, favicon, colours, font, contact, landing texts. */
export default async function AdminBrandingPage() {
  await requirePermission("settings.manage", "/branding");
  const [branding, t] = await Promise.all([getPlatformBrandingSettings(), getTranslations("adminBranding")]);
  const keys = [
    "name",
    "nameHint",
    "tagline",
    "logo",
    "logoHint",
    "favicon",
    "faviconHint",
    "upload",
    "uploading",
    "change",
    "remove",
    "save",
    "saved",
    "primaryColor",
    "accentColor",
    "contrastPrimary",
    "contrastAccent",
    "font",
    "fontSystem",
    "preview",
    "previewText",
    "previewButton",
    "previewSecondary",
    "previewBadge",
    "previewLink",
    "contactEmail",
    "contactPhone",
    "socials",
    "socialPlatform",
    "socialUrl",
    "addSocial",
    "error.generic",
    "error.invalidImage",
    "error.unsupportedType",
    "error.fileTooLarge",
  ] as const;
  const labels = Object.fromEntries(keys.map((key) => [key, t(key)]));

  // Landing fields: the default text (in that locale) is each field's placeholder.
  const translators = Object.fromEntries(
    await Promise.all(locales.map(async (locale) => [locale, await getTranslator(locale)] as const)),
  );
  const fieldLabel = (key: LandingTextKey) => {
    const parts = key.split(".");
    const last = parts.at(-1)!;
    const itemIndex = (list: readonly string[]) => list.indexOf(parts[2]!) + 1;
    if (key === "home.title") return t("field.heroTitle");
    if (key === "home.subtitle") return t("field.heroSubtitle");
    if (key === "home.cta") return t("field.heroCta");
    if (key === "marketing.hero.note") return t("field.heroNote");
    if (parts.length === 3) return t(last === "subtitle" ? "field.sectionSubtitle" : "field.sectionTitle");
    const group = groupOf(key);
    const items =
      group === "features"
        ? ["editor", "templates", "domain", "stats", "contact", "invoices"]
        : group === "steps"
          ? ["account", "template", "publish"]
          : ["trial", "publish", "cancel", "invoices", "domain", "data"];
    const part = { title: "itemTitle", text: "itemText", q: "question", a: "answer" }[last] as
      "itemTitle" | "itemText" | "question" | "answer";
    return t(`field.${part}`, { number: itemIndex(items) });
  };
  const groupsFor = (locale: (typeof locales)[number]) =>
    LANDING_GROUPS.map((group) => ({
      title: t(`landingGroup.${group}`),
      fields: LANDING_TEXT_KEYS.filter((key) => groupOf(key) === group).map((key) => ({
        key,
        label: fieldLabel(key),
        placeholder: (translators[locale] as (k: string) => string)(key),
        long: /\.(text|a|subtitle)$/.test(key) || key === "home.subtitle",
      })),
    }));

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8" data-testid="admin-branding">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("identity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandIdentityForm branding={branding} defaultName={getEnv().BRAND_NAME} labels={labels} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("colors")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandColorsForm branding={branding} brandName={brandNameOf(branding)} labels={labels} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("contact")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandContactForm branding={branding} labels={labels} />
        </CardContent>
      </Card>
      {/* Long forms: collapsed by default, one per language. */}
      {locales.map((locale) => (
        <details key={locale} className="group rounded-xl border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6">
            <span className="grid gap-1">
              <span className="font-semibold">{t("landing", { locale: locale.toUpperCase() })}</span>
              <span className="text-sm text-muted-foreground">{t("landingHint")}</span>
            </span>
            <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="px-6 pb-6">
            <LandingTextsForm
              locale={locale}
              groups={groupsFor(locale)}
              values={branding.landing[locale] ?? {}}
              labels={labels}
            />
          </div>
        </details>
      ))}
    </main>
  );
}
