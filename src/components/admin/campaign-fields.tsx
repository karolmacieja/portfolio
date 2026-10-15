import { getTranslations } from "next-intl/server";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Audience } from "@/server/newsletter/audience";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";
const SEGMENTS = ["all", "plan", "noPlan", "license", "organization"] as const;

type Values = {
  subject?: string;
  body?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  type?: "MARKETING" | "SERVICE";
  audience?: Audience;
};

/** Campaign form fields (create and edit). */
export async function CampaignFields({
  plans,
  organizations,
  values = {},
}: {
  plans: { id: string; name: string }[];
  organizations: { id: string; name: string }[];
  values?: Values;
}) {
  const t = await getTranslations("newsletter");
  const label = {
    subject: t("fields.subject"),
    body: t("fields.body"),
    bodyHint: t("fields.bodyHint"),
    ctaLabel: t("fields.ctaLabel"),
    ctaUrl: t("fields.ctaUrl"),
    type: t("fields.type"),
    marketing: t("types.MARKETING"),
    service: t("types.SERVICE"),
    typeHint: t("fields.typeHint"),
    segment: t("fields.segment"),
    plan: t("fields.plan"),
    organization: t("fields.organization"),
    segments: Object.fromEntries(SEGMENTS.map((s) => [s, t(`segments.${s}`)])) as Record<
      (typeof SEGMENTS)[number],
      string
    >,
  };
  const audience = values.audience;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor="c-subject">{label.subject}</Label>
        <Input id="c-subject" name="subject" required maxLength={200} defaultValue={values.subject} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="c-body">{label.body}</Label>
        <textarea
          id="c-body"
          name="body"
          rows={10}
          required
          maxLength={20_000}
          defaultValue={values.body}
          className="rounded-md border bg-background p-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">{label.bodyHint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="c-cta-label">{label.ctaLabel}</Label>
          <Input id="c-cta-label" name="ctaLabel" maxLength={60} defaultValue={values.ctaLabel ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="c-cta-url">{label.ctaUrl}</Label>
          <Input
            id="c-cta-url"
            name="ctaUrl"
            type="url"
            maxLength={500}
            defaultValue={values.ctaUrl ?? ""}
            placeholder="https://"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="c-type">{label.type}</Label>
          <select id="c-type" name="type" defaultValue={values.type ?? "MARKETING"} className={selectClass}>
            <option value="MARKETING">{label.marketing}</option>
            <option value="SERVICE">{label.service}</option>
          </select>
          <p className="text-xs text-muted-foreground">{label.typeHint}</p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="c-segment">{label.segment}</Label>
          <select
            id="c-segment"
            name="segment"
            defaultValue={audience?.segment ?? "all"}
            className={selectClass}
          >
            {SEGMENTS.map((segment) => (
              <option key={segment} value={segment}>
                {label.segments[segment]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="c-plan">{label.plan}</Label>
          <select
            id="c-plan"
            name="planId"
            defaultValue={audience?.segment === "plan" ? audience.planId : plans[0]?.id}
            className={selectClass}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="c-org">{label.organization}</Label>
          <select
            id="c-org"
            name="organizationId"
            defaultValue={
              audience?.segment === "organization" ? audience.organizationId : organizations[0]?.id
            }
            className={selectClass}
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
