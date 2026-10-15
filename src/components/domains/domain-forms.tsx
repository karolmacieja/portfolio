"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  addDomainAction,
  checkDomainAction,
  clearPrimaryDomainAction,
  reenableDomainAction,
  removeDomainAction,
  searchDomainsAction,
  setDomainAutoRenewAction,
  setPrimaryDomainAction,
  showAuthCodeAction,
  startDomainPurchaseAction,
  type AuthCodeState,
  type DomainSearchState,
} from "@/server/domains/actions";

export function AddDomainForm({ siteId }: { siteId: string }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<ActionState, FormData>(addDomainAction, {});
  return (
    <form
      action={action}
      className="grid gap-3"
      data-testid="add-domain-form"
      key={state.ok ? "done" : "form"}
    >
      <input type="hidden" name="siteId" value={siteId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="domain-hostname">{t("hostname")}</Label>
          <Input
            id="domain-hostname"
            name="hostname"
            placeholder="www.jan-kowalski.pl"
            required
            maxLength={253}
            defaultValue={state.ok ? "" : state.values?.hostname}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {t("add")}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="includeCompanion" defaultChecked />
        {t("includeCompanion")}
      </label>
      <FormMessage state={state} success={t("added")} />
    </form>
  );
}

type DomainActionKind = "check" | "primary" | "remove" | "reenable";
const DOMAIN_ACTIONS = {
  check: checkDomainAction,
  primary: setPrimaryDomainAction,
  remove: removeDomainAction,
  reenable: reenableDomainAction,
} as const;

export function DomainActionButton({ domainId, kind }: { domainId: string; kind: DomainActionKind }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<ActionState, FormData>(DOMAIN_ACTIONS[kind], {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (kind === "remove" && !confirm(t("removeConfirm"))) event.preventDefault();
      }}
    >
      <input type="hidden" name="domainId" value={domainId} />
      <Button type="submit" size="sm" variant={kind === "remove" ? "ghost" : "outline"} disabled={pending}>
        {t(`actions.${kind}`)}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function ClearPrimaryButton({ siteId }: { siteId: string }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<ActionState, FormData>(clearPrimaryDomainAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="siteId" value={siteId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {t("useSubdomain")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export type RegistrantDefaults = {
  type: "PERSON" | "COMPANY";
  firstName: string;
  lastName: string;
  companyName: string;
  taxId: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

function RegistrantForm({
  siteId,
  domain,
  price,
  defaults,
  onCancel,
}: {
  siteId: string;
  domain: string;
  price: string;
  defaults: RegistrantDefaults;
  onCancel: () => void;
}) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<ActionState, FormData>(startDomainPurchaseAction, {});
  const values: Record<string, string> = {
    ...defaults,
    phoneCountryCode: "+48",
    phoneNumber: "",
    ...state.values,
  };
  const [type, setType] = useState(values.type === "COMPANY" ? "COMPANY" : "PERSON");
  const field = (name: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`registrant-${name}`}>{t(`registrant.${name}` as "registrant.firstName")}</Label>
      <Input id={`registrant-${name}`} name={name} defaultValue={values[name]} {...props} />
    </div>
  );
  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4" data-testid="registrant-form">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="domain" value={domain} />
      <p className="text-sm">
        {t("buying", { domain, price })} <span className="text-muted-foreground">{t("registrantHint")}</span>
      </p>
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
            {t(`registrant.${option}`)}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("firstName", { required: true, maxLength: 60 })}
        {field("lastName", { required: true, maxLength: 60 })}
        {type === "COMPANY" && field("companyName", { required: true, maxLength: 200 })}
        {type === "COMPANY" && field("taxId", { maxLength: 20 })}
        {field("email", { type: "email", required: true, maxLength: 200 })}
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          {field("phoneCountryCode", { required: true, maxLength: 4 })}
          {field("phoneNumber", { required: true, maxLength: 20, inputMode: "tel" })}
        </div>
        {field("street", { required: true, maxLength: 200 })}
        <div className="grid grid-cols-[1fr_2fr_4rem] gap-2">
          {field("postalCode", { required: true, maxLength: 16 })}
          {field("city", { required: true, maxLength: 100 })}
          {field("country", { required: true, maxLength: 2 })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {t("payAndRegister", { price })}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DomainSearch({ siteId, defaults }: { siteId: string; defaults: RegistrantDefaults }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<DomainSearchState, FormData>(searchDomainsAction, {});
  const [selected, setSelected] = useState<{ domain: string; price: string } | null>(null);
  const locale = useLocale();
  const format = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(amount / 100);

  return (
    <div className="grid gap-4">
      <form action={action} className="flex gap-2" data-testid="domain-search-form">
        <Input
          name="query"
          placeholder={t("searchPlaceholder")}
          defaultValue={state.query}
          required
          maxLength={100}
          aria-label={t("search")}
        />
        <Button type="submit" disabled={pending} onClick={() => setSelected(null)}>
          {t("search")}
        </Button>
      </form>
      <FormMessage state={state} />
      {state.offers && !selected && (
        <ul className="grid gap-2" data-testid="domain-offers">
          {state.offers.map((offer) => (
            <li
              key={offer.domain}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className={offer.available ? "font-medium" : "text-muted-foreground line-through"}>
                {offer.domain}
              </span>
              {offer.available && offer.price !== null ? (
                <span className="flex items-center gap-3">
                  {t("perYear", { price: format(offer.price) })}
                  <Button
                    size="sm"
                    onClick={() => setSelected({ domain: offer.domain, price: format(offer.price!) })}
                  >
                    {t("choose")}
                  </Button>
                </span>
              ) : (
                <span className="text-muted-foreground">{t("unavailable")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <RegistrantForm
          siteId={siteId}
          domain={selected.domain}
          price={selected.price}
          defaults={defaults}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function AutoRenewToggle({ orderId, autoRenew }: { orderId: string; autoRenew: boolean }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<ActionState, FormData>(setDomainAutoRenewAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="autoRenew" value={autoRenew ? "0" : "1"} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {autoRenew ? t("autoRenewOff") : t("autoRenewOn")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function AuthCodeButton({ orderId }: { orderId: string }) {
  const t = useTranslations("domains");
  const [state, action, pending] = useActionState<AuthCodeState, FormData>(showAuthCodeAction, {});
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      {state.code ? (
        <code className="rounded bg-muted px-2 py-1 text-sm" data-testid="auth-code">
          {state.code}
        </code>
      ) : (
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          {t("authCode")}
        </Button>
      )}
      <FormMessage state={state} />
    </form>
  );
}
