"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  resendKsefAction,
  retryInvoiceAction,
  saveInvoicingSettingsAction,
} from "@/server/invoicing/actions";

export function InvoiceActionButton({ invoiceId, kind }: { invoiceId: string; kind: "retry" | "ksef" }) {
  const t = useTranslations("adminInvoices");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    kind === "retry" ? retryInvoiceAction : resendKsefAction,
    {},
  );
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {kind === "retry" ? t("retry") : t("resendKsef")}
      </Button>
      <FormMessage state={state} success={t("queued")} />
    </form>
  );
}

export type InvoicingSettingsValues = Record<
  | "vatRate"
  | "exemptionBasis"
  | "placeOfIssue"
  | "sellerName"
  | "sellerTaxId"
  | "sellerStreet"
  | "sellerPostalCode"
  | "sellerCity"
  | "sellerCountry"
  | "sellerEmail"
  | "sellerBankAccount",
  string
>;

export function InvoicingSettingsForm({
  initial,
  vatRates,
}: {
  initial: InvoicingSettingsValues;
  vatRates: readonly string[];
}) {
  const t = useTranslations("adminSettings");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveInvoicingSettingsAction, {});
  const values = { ...initial, ...(state.values as Partial<InvoicingSettingsValues> | undefined) };
  const field = (name: keyof InvoicingSettingsValues, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`settings-${name}`}>{t(`fields.${name}`)}</Label>
      <Input id={`settings-${name}`} name={name} defaultValue={values[name]} {...props} />
    </div>
  );

  return (
    <form action={action} className="grid gap-4" data-testid="invoicing-settings-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="settings-vatRate">{t("fields.vatRate")}</Label>
          <select
            id="settings-vatRate"
            name="vatRate"
            defaultValue={values.vatRate}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {vatRates.map((rate) => (
              <option key={rate} value={rate}>
                {t(`vatRates.${rate as "23"}`)}
              </option>
            ))}
          </select>
        </div>
        {field("placeOfIssue", { maxLength: 100 })}
      </div>
      {field("exemptionBasis", { maxLength: 256, placeholder: t("exemptionPlaceholder") })}
      <h3 className="mt-2 font-medium">{t("seller")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("sellerName", { required: true, maxLength: 200 })}
        {field("sellerTaxId", { maxLength: 20 })}
        {field("sellerStreet", { maxLength: 200 })}
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
          {field("sellerPostalCode", { maxLength: 16 })}
          {field("sellerCity", { maxLength: 100 })}
          {field("sellerCountry", { maxLength: 2, required: true, className: "w-16" })}
        </div>
        {field("sellerEmail", { type: "email", maxLength: 200 })}
        {field("sellerBankAccount", { maxLength: 40 })}
      </div>
      <p className="text-sm text-muted-foreground">{t("fakturowniaHint")}</p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <FormMessage state={state} success={t("saved")} />
      </div>
    </form>
  );
}
