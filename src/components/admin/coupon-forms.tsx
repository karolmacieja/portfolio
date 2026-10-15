"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import { createCouponAction } from "@/server/billing/actions";

const DURATIONS = ["ONCE", "REPEATING", "FOREVER"] as const;

export function CreateCouponForm() {
  const t = useTranslations("coupons");
  const [state, action, pending] = useActionState<ActionState, FormData>(createCouponAction, {});
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>("ONCE");
  const input = (name: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`coupon-${name}`}>{t(name as "code")}</Label>
      <Input
        id={`coupon-${name}`}
        name={name}
        defaultValue={state.ok ? "" : state.values?.[name]}
        {...props}
      />
    </div>
  );

  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-3"
      data-testid="create-coupon-form"
      key={state.ok ? "reset" : "form"}
    >
      {input("code", { required: true, maxLength: 30, pattern: "[A-Za-z0-9_-]{3,30}" })}
      {input("name", { required: true, maxLength: 80 })}
      <div className="grid gap-2">
        <Label htmlFor="coupon-duration">{t("duration")}</Label>
        <select
          id="coupon-duration"
          name="duration"
          value={duration}
          onChange={(event) => setDuration(event.target.value as (typeof DURATIONS)[number])}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {DURATIONS.map((option) => (
            <option key={option} value={option}>
              {t(`durationOption.${option}`)}
            </option>
          ))}
        </select>
      </div>
      {input("percentOff", { type: "number", min: 1, max: 100 })}
      {input("amountOff", { inputMode: "decimal", pattern: "[0-9]+([.,][0-9]{1,2})?" })}
      {duration === "REPEATING" ? (
        input("durationInMonths", { type: "number", min: 1, max: 36, required: true })
      ) : (
        <div />
      )}
      {input("maxRedemptions", { type: "number", min: 1 })}
      {input("expiresAt", { type: "date" })}
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {t("create")}
        </Button>
      </div>
      <div className="sm:col-span-3">
        <FormMessage state={state} success={t("created")} />
      </div>
    </form>
  );
}
