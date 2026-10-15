"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  inviteMembersAction,
  startLicensePurchaseAction,
  updateOrganizationAction,
} from "@/server/licenses/actions";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

export type LicensePlanOption = {
  id: string;
  name: string;
  seatPriceMonthly: number | null;
  seatPriceYearly: number | null;
};

function formatPln(grosze: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(grosze / 100);
}

/** Buying a license: plan, interval and seats with the live total (the server recomputes the price). */
export function LicensePurchaseForm({
  plans,
  locale,
  minSeats,
  disabled,
}: {
  plans: LicensePlanOption[];
  locale: string;
  minSeats: number;
  disabled: boolean;
}) {
  const t = useTranslations("licenses");
  const [state, action, pending] = useActionState<ActionState, FormData>(startLicensePurchaseAction, {});
  const [planId, setPlanId] = useState(state.values?.planId ?? plans[0]?.id ?? "");
  const [interval, setInterval] = useState<"MONTH" | "YEAR">((state.values?.interval as "YEAR") ?? "MONTH");
  const [seats, setSeats] = useState(Number(state.values?.seats ?? 10));
  const plan = plans.find((p) => p.id === planId);
  const unit = interval === "YEAR" ? plan?.seatPriceYearly : plan?.seatPriceMonthly;

  return (
    <form action={action} className="grid gap-4" data-testid="license-purchase-form">
      <div className="grid gap-2">
        <Label htmlFor="org-name">{t("organizationName")}</Label>
        <Input id="org-name" name="name" required maxLength={120} defaultValue={state.values?.name} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="plan">{t("plan")}</Label>
          <select
            id="plan"
            name="planId"
            className={selectClass}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="interval">{t("interval")}</Label>
          <select
            id="interval"
            name="interval"
            className={selectClass}
            value={interval}
            onChange={(e) => setInterval(e.target.value as "MONTH" | "YEAR")}
          >
            {plan?.seatPriceMonthly && <option value="MONTH">{t("monthly")}</option>}
            {plan?.seatPriceYearly && <option value="YEAR">{t("yearly")}</option>}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="seats">{t("seats")}</Label>
          <Input
            id="seats"
            name="seats"
            type="number"
            min={minSeats}
            max={1000}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            required
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sponsorName">{t("sponsorName")}</Label>
          <Input
            id="sponsorName"
            name="sponsorName"
            maxLength={120}
            defaultValue={state.values?.sponsorName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sponsorUrl">{t("sponsorUrl")}</Label>
          <Input
            id="sponsorUrl"
            name="sponsorUrl"
            type="url"
            maxLength={300}
            placeholder="https://"
            defaultValue={state.values?.sponsorUrl}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("sponsorHint")}</p>
      {unit ? (
        <p className="text-lg font-semibold" data-testid="license-total">
          {t(interval === "YEAR" ? "totalYearly" : "totalMonthly", {
            total: formatPln(unit * Math.max(seats || 0, 0), locale),
            unit: formatPln(unit, locale),
            seats: seats || 0,
          })}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending || disabled || !unit}>
          {t("buy")}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function OrganizationForm({
  name,
  sponsorName,
  sponsorUrl,
  joinLinkEnabled,
}: {
  name: string;
  sponsorName: string;
  sponsorUrl: string;
  joinLinkEnabled: boolean;
}) {
  const t = useTranslations("licenses");
  const [state, action, pending] = useActionState<ActionState, FormData>(updateOrganizationAction, {});
  return (
    <form action={action} className="grid gap-4" data-testid="organization-form">
      <div className="grid gap-2">
        <Label htmlFor="org-name">{t("organizationName")}</Label>
        <Input id="org-name" name="name" required maxLength={120} defaultValue={name} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sponsorName">{t("sponsorName")}</Label>
          <Input id="sponsorName" name="sponsorName" maxLength={120} defaultValue={sponsorName} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sponsorUrl">{t("sponsorUrl")}</Label>
          <Input id="sponsorUrl" name="sponsorUrl" type="url" maxLength={300} defaultValue={sponsorUrl} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="joinLinkEnabled" defaultChecked={joinLinkEnabled} />
        {t("joinLinkEnabled")}
      </label>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      <FormMessage state={state} success={t("saved")} />
    </form>
  );
}

export function InviteForm({ freeSeats }: { freeSeats: number }) {
  const t = useTranslations("licenses");
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMembersAction, {});
  return (
    <form action={action} className="grid gap-2" data-testid="invite-form">
      <Label htmlFor="emails">{t("inviteLabel", { free: freeSeats })}</Label>
      <textarea
        id="emails"
        name="emails"
        rows={3}
        className="rounded-md border bg-background p-2 text-sm"
        placeholder="anna@example.com, jan@example.com"
        defaultValue={state.ok ? "" : state.values?.emails}
      />
      <div>
        <Button type="submit" size="sm" disabled={pending || freeSeats <= 0}>
          {t("invite")}
        </Button>
      </div>
      <FormMessage state={state} success={t("invited", { count: Number(state.values?.sent ?? 0) })} />
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useTranslations("licenses");
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} data-testid="join-link" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}
