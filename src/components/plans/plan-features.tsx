import { getLocale, getTranslations } from "next-intl/server";

import { formatMegabytes } from "@/lib/format";
import { PLAN_FEATURES } from "@/server/entitlements";
import type { PlanCard } from "@/server/plans/service";

/** Limits, block tiers and features of a plan (pricing page and panel plan picker). */
export async function PlanFeatureList({ plan }: { plan: PlanCard }) {
  const [t, locale] = await Promise.all([getTranslations("plans"), getLocale()]);
  return (
    <ul className="grid gap-1 text-sm">
      {plan.highlights.map((item) => (
        <li key={item} className="font-medium">
          ★ {item}
        </li>
      ))}
      <li>{t("limits.maxSites", { count: plan.maxSites })}</li>
      <li>{t("limits.maxPagesPerSite", { count: plan.maxPagesPerSite })}</li>
      <li>
        {plan.maxProjects === null
          ? t("limits.maxProjectsUnlimited")
          : t("limits.maxProjects", { count: plan.maxProjects })}
      </li>
      <li>{t("limits.storageMb", { size: formatMegabytes(plan.storageMb, locale) })}</li>
      {plan.accessTiers.map((tier) => (
        <li key={tier}>{t(`tiers.${tier}`)}</li>
      ))}
      {PLAN_FEATURES.filter((feature) => plan.features[feature]).map((feature) => (
        <li key={feature}>✓ {t(`features.${feature}`)}</li>
      ))}
    </ul>
  );
}
