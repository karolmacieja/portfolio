"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  adminCheckDomainAction,
  retryDomainOrderAction,
  saveDomainSettingsAction,
} from "@/server/domains/actions";

export function AdminCheckDomainButton({ domainId }: { domainId: string }) {
  const t = useTranslations("adminDomains");
  const [state, action, pending] = useActionState<ActionState, FormData>(adminCheckDomainAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="domainId" value={domainId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("check")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RetryDomainOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("adminDomains");
  const [state, action, pending] = useActionState<ActionState, FormData>(retryDomainOrderAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("retry")}
      </Button>
      <FormMessage state={state} success={t("queued")} />
    </form>
  );
}

export type DomainSettingsValues = Record<
  "tlds" | "markupPercent" | "minMarkup" | "eurRate" | "usdRate" | "maxHostnamesPerSite",
  string
>;

export function DomainSettingsForm({ initial }: { initial: DomainSettingsValues }) {
  const t = useTranslations("adminSettings");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDomainSettingsAction, {});
  const values = { ...initial, ...(state.values as Partial<DomainSettingsValues> | undefined) };
  const field = (name: keyof DomainSettingsValues, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`domains-${name}`}>{t(`domainFields.${name}`)}</Label>
      <Input id={`domains-${name}`} name={name} defaultValue={values[name]} {...props} />
    </div>
  );
  return (
    <form action={action} className="grid gap-4" data-testid="domain-settings-form">
      {field("tlds", { required: true })}
      <div className="grid gap-4 sm:grid-cols-3">
        {field("markupPercent", { type: "number", min: 0, max: 500, step: "0.1", required: true })}
        {field("minMarkup", { inputMode: "decimal", required: true })}
        {field("maxHostnamesPerSite", { type: "number", min: 1, max: 20, required: true })}
        {field("eurRate", { type: "number", min: 0.01, step: "0.0001", required: true })}
        {field("usdRate", { type: "number", min: 0.01, step: "0.0001", required: true })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <FormMessage state={state} success={t("saved")} />
      </div>
    </form>
  );
}
