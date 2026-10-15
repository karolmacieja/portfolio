"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  changePlanAction,
  mockPortalAction,
  openPortalAction,
  purchaseTemplateAction,
  resendVerificationAction,
  saveBillingProfileAction,
  setCancelAtPeriodEndAction,
  startCheckoutAction,
} from "@/server/billing/actions";

/** Buy a plan price (Checkout) with an optional coupon code. */
export function CheckoutForm({ priceId, label }: { priceId: string; label: string }) {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(startCheckoutAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="priceId" value={priceId} />
      <Label htmlFor={`coupon-${priceId}`} className="text-xs text-muted-foreground">
        {t("coupon")}
      </Label>
      <Input id={`coupon-${priceId}`} name="coupon" maxLength={40} defaultValue={state.values?.coupon} />
      <Button type="submit" disabled={pending} className="w-full">
        {label}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** Switch an existing provider-managed subscription to another price (prorated). */
export function ChangePlanForm({ priceId }: { priceId: string }) {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(changePlanAction, {});
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(event) => {
        if (!confirm(t("switchConfirm"))) event.preventDefault();
      }}
    >
      <input type="hidden" name="priceId" value={priceId} />
      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {t("switchTo")}
      </Button>
      <FormMessage state={state} success={t("switched")} />
    </form>
  );
}

export function CancelSubscriptionForm({ cancelAtPeriodEnd }: { cancelAtPeriodEnd: boolean }) {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(setCancelAtPeriodEndAction, {});
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(event) => {
        if (!cancelAtPeriodEnd && !confirm(t("cancelConfirm"))) event.preventDefault();
      }}
    >
      <input type="hidden" name="cancel" value={cancelAtPeriodEnd ? "0" : "1"} />
      <Button type="submit" variant={cancelAtPeriodEnd ? "default" : "outline"} size="sm" disabled={pending}>
        {cancelAtPeriodEnd ? t("resume") : t("cancel")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function PortalButton() {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(openPortalAction, {});
  return (
    <form action={action} className="grid gap-2">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("portal")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function ResendVerificationButton() {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(resendVerificationAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("verifyEmail")}
      </Button>
      <FormMessage state={state} success={t("verificationSent")} />
    </form>
  );
}

export function BuyTemplateForm({ templateId, label }: { templateId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(purchaseTemplateAction, {});
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="templateId" value={templateId} />
      <Button type="submit" size="sm" disabled={pending}>
        {label}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export type BillingProfileValues = {
  type: "PERSON" | "COMPANY";
  fullName: string;
  companyName: string;
  taxId: string;
  euVatId: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  country: string;
};

export function BillingProfileForm({ initial, next }: { initial: BillingProfileValues; next?: string }) {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBillingProfileAction, {});
  const values = { ...initial, ...(state.values as Partial<BillingProfileValues> | undefined) };
  const [type, setType] = useState(values.type);

  const field = (
    name: keyof BillingProfileValues,
    options: { required?: boolean; maxLength?: number } = {},
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`billing-${name}`}>{t(`profileForm.${name}`)}</Label>
      <Input
        id={`billing-${name}`}
        name={name}
        defaultValue={values[name]}
        required={options.required}
        maxLength={options.maxLength ?? 200}
      />
    </div>
  );

  return (
    <form action={action} className="grid gap-4" data-testid="billing-profile-form">
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("profileForm.type")}</legend>
        <div className="flex gap-4 text-sm">
          {(["PERSON", "COMPANY"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
              />
              {t(`profileForm.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {field("fullName", { required: true, maxLength: 120 })}
      {type === "COMPANY" && (
        <>
          {field("companyName", { required: true })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("taxId", { maxLength: 20 })}
            {field("euVatId", { maxLength: 20 })}
          </div>
        </>
      )}
      {field("line1", { required: true })}
      {field("line2")}
      <div className="grid gap-4 sm:grid-cols-3">
        {field("postalCode", { required: true, maxLength: 16 })}
        {field("city", { required: true, maxLength: 100 })}
        {field("country", { required: true, maxLength: 2 })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("profileForm.save")}
        </Button>
        <FormMessage state={state} success={t("saved")} />
      </div>
    </form>
  );
}

export function MockPortalActions() {
  const t = useTranslations("billing.mock");
  const [state, action, pending] = useActionState<ActionState, FormData>(mockPortalAction, {});
  return (
    <form action={action} className="grid gap-2">
      {(["renewOk", "renewFail", "end"] as const).map((op) => (
        <Button key={op} type="submit" name="op" value={op} variant="outline" disabled={pending}>
          {t(op)}
        </Button>
      ))}
      <FormMessage state={state} success={t("done")} />
    </form>
  );
}
