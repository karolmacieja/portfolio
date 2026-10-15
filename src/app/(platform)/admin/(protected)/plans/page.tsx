import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BLOCK_TYPES } from "@/blocks/schemas";
import { formatMoney } from "@/lib/format";
import {
  savePlanAction,
  setBlockTierAction,
  setPlanPriceAction,
  syncPricesAction,
} from "@/server/admin/catalog-actions";
import { listPlansAdmin } from "@/server/admin/plans";
import { setSeatPricesAction } from "@/server/licenses/admin-actions";
import { requirePermission } from "@/server/auth/session";
import { ACCESS_TIERS, getBlockTiers, PLAN_FEATURES, parseFeatures } from "@/server/entitlements";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPlans");
  return { title: t("title") };
}

type PlanRow = Awaited<ReturnType<typeof listPlansAdmin>>[number];

async function PlanForm({ plan }: { plan: PlanRow | null }) {
  const t = await getTranslations("adminPlans");
  const tPlans = await getTranslations("plans");
  const features = parseFeatures(plan?.features ?? {});
  const field = (
    name: string,
    value: string | number | null | undefined,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <div className="grid gap-1">
      <Label htmlFor={`${plan?.id ?? "new"}-${name}`}>{t(`fields.${name}` as "fields.name")}</Label>
      <Input id={`${plan?.id ?? "new"}-${name}`} name={name} defaultValue={value ?? ""} {...props} />
    </div>
  );
  return (
    <ActionForm
      action={savePlanAction}
      hidden={plan ? { planId: plan.id } : {}}
      label={plan ? t("save") : t("create")}
      success={t("saved")}
      testId={`plan-form-${plan?.slug ?? "new"}`}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        {field("name", plan?.name, { required: true, maxLength: 60 })}
        {field("slug", plan?.slug, { required: true, pattern: "[a-z0-9-]{2,40}" })}
        {field("position", plan?.position ?? 10, { type: "number", min: 0 })}
        {field("trialDays", plan?.trialDays ?? 14, { type: "number", min: 0, max: 90 })}
        {field("maxSites", plan?.maxSites ?? 1, { type: "number", min: 1 })}
        {field("maxPagesPerSite", plan?.maxPagesPerSite ?? 5, { type: "number", min: 1 })}
        {field("maxProjects", plan ? plan.maxProjects : 30, {
          type: "number",
          min: 0,
          placeholder: t("unlimited"),
        })}
        {field("storageMb", plan?.storageMb ?? 500, { type: "number", min: 10 })}
      </div>
      {field("description", plan?.description, { maxLength: 300 })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} />
          {t("fields.isActive")}
        </label>
        {PLAN_FEATURES.map((feature) => (
          <label key={feature} className="flex items-center gap-2">
            <input type="checkbox" name={`feature.${feature}`} defaultChecked={features[feature]} />
            {tPlans(`features.${feature}`)}
          </label>
        ))}
        {ACCESS_TIERS.map((tier) => (
          <label key={tier} className="flex items-center gap-2">
            <input
              type="checkbox"
              name={`tier.${tier}`}
              defaultChecked={tier === "basic" || (plan?.accessTiers ?? []).includes(tier)}
              disabled={tier === "basic"}
            />
            {tPlans(`tiers.${tier}`)}
          </label>
        ))}
      </div>
    </ActionForm>
  );
}

/** Plan catalog (ADMIN): limits, flags, tiers and prices; block tiers. */
export default async function AdminPlansPage() {
  await requirePermission("plans.manage", "/plans");
  const [plans, tiers, t, tBlocks, locale] = await Promise.all([
    listPlansAdmin(),
    getBlockTiers(),
    getTranslations("adminPlans"),
    getTranslations("blocks"),
    getLocale(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <ActionForm
          action={syncPricesAction}
          hidden={{}}
          label={t("syncPrices")}
          success={t("synced")}
          className="flex items-center gap-2"
        />
      </div>
      {plans.map((plan) => (
        <Card key={plan.id} data-testid={`admin-plan-${plan.slug}`}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-2">
            <CardTitle>{plan.name}</CardTitle>
            {!plan.isActive && <Badge variant="outline">{t("inactive")}</Badge>}
            <Badge variant="secondary">{t("subscribers", { count: plan.subscribers })}</Badge>
          </CardHeader>
          <CardContent className="grid gap-6">
            <PlanForm plan={plan} />
            <div className="grid gap-3 sm:grid-cols-2">
              {(["MONTH", "YEAR"] as const).map((interval) => {
                const active = plan.prices.find((p) => p.interval === interval && p.isActive);
                const history = plan.prices.filter((p) => p.interval === interval && !p.isActive);
                return (
                  <div key={interval} className="grid gap-2 rounded-md border p-3 text-sm">
                    <ActionForm
                      action={setPlanPriceAction}
                      hidden={{ planId: plan.id, interval }}
                      label={t("setPrice")}
                      success={t("saved")}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <div className="grid gap-1">
                        <Label htmlFor={`${plan.id}-${interval}`}>{t(`interval.${interval}`)}</Label>
                        <Input
                          id={`${plan.id}-${interval}`}
                          name="amount"
                          inputMode="decimal"
                          defaultValue={active ? (active.amount / 100).toFixed(2) : ""}
                          className="h-8 w-28"
                        />
                      </div>
                    </ActionForm>
                    <span className="text-xs text-muted-foreground">
                      {active?.stripePriceId ? `Stripe: ${active.stripePriceId}` : t("notSynced")}
                      {history.length > 0 &&
                        ` · ${t("previous", { prices: history.map((p) => formatMoney(p.amount, p.currency, locale)).join(", ") })}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <ActionForm
              action={setSeatPricesAction}
              hidden={{ planId: plan.id }}
              label={t("saveSeatPrices")}
              success={t("saved")}
              className="flex flex-wrap items-end gap-2 rounded-md border p-3 text-sm"
              testId={`seat-prices-${plan.slug}`}
            >
              <p className="w-full text-xs text-muted-foreground">{t("seatPricesHint")}</p>
              {(["seatPriceMonthly", "seatPriceYearly"] as const).map((field) => (
                <div key={field} className="grid gap-1">
                  <Label htmlFor={`${plan.id}-${field}`}>{t(field)}</Label>
                  <Input
                    id={`${plan.id}-${field}`}
                    name={field}
                    inputMode="decimal"
                    defaultValue={plan[field] ? (plan[field] / 100).toFixed(2) : ""}
                    className="h-8 w-28"
                  />
                </div>
              ))}
            </ActionForm>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>{t("newPlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanForm plan={null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("blockTiers")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {BLOCK_TYPES.map((blockType) => (
            <ActionForm
              key={blockType}
              action={setBlockTierAction}
              hidden={{ blockType }}
              label={t("save")}
              className="flex flex-wrap items-center gap-2"
              testId={`block-tier-${blockType}`}
            >
              <span className="w-40 text-sm">{tBlocks(`names.${blockType}` as never)}</span>
              <select
                name="tier"
                defaultValue={tiers[blockType]}
                aria-label={blockType}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {ACCESS_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
