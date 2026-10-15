"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { priceEconomics, type CostInputs } from "@/server/finance/economics";

function pln(grosze: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(grosze / 100);
}

/**
 * A gross price field (zł) with a live breakdown: net, VAT, payment fee, cost of serving the client for the
 * period and the resulting net profit with margin.
 */
export function PriceInput({
  id,
  name,
  label,
  defaultValue,
  months,
  costs,
  locale,
  testId,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  months: number;
  costs: CostInputs;
  locale: string;
  testId?: string;
}) {
  const t = useTranslations("finance.preview");
  const [value, setValue] = useState(defaultValue);
  const gross = Math.round(Number(value.replace(",", ".")) * 100);
  const valid = Number.isFinite(gross) && gross > 0;
  const e = valid ? priceEconomics(gross, months, costs) : null;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-28"
      />
      {e && (
        <p
          className={`max-w-xs text-xs ${e.profit < 0 ? "text-destructive" : "text-muted-foreground"}`}
          data-testid={testId}
        >
          {t("line", {
            net: pln(e.net, locale),
            fee: pln(e.fee, locale),
            cost: pln(e.cost, locale),
            profit: pln(e.profit, locale),
            margin: Math.round(e.margin * 100),
          })}
        </p>
      )}
    </div>
  );
}
