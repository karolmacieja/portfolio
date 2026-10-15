import { getTranslations } from "next-intl/server";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

type Values = {
  name?: string;
  planId?: string;
  seats?: number;
  validUntil?: Date | null;
  note?: string | null;
  sponsorName?: string | null;
  sponsorUrl?: string | null;
  membersCanBuyDomains?: boolean;
};

/** Shared fields of the staff license forms (create and edit). */
export async function LicenseFields({
  plans,
  values = {},
  lockBilling = false,
}: {
  plans: { id: string; name: string }[];
  values?: Values;
  /** Self-service licenses: plan, seats and period are paid at the provider and not edited here. */
  lockBilling?: boolean;
}) {
  const t = await getTranslations("adminLicenses");
  const label = {
    name: t("name"),
    plan: t("plan"),
    seats: t("seats"),
    validUntil: t("validUntil"),
    sponsorName: t("sponsorName"),
    sponsorUrl: t("sponsorUrl"),
    note: t("note"),
    membersCanBuyDomains: t("membersCanBuyDomains"),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <Label htmlFor="lic-name">{label.name}</Label>
        <Input id="lic-name" name="name" required maxLength={120} defaultValue={values.name} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lic-plan">{label.plan}</Label>
        <select
          id="lic-plan"
          name="planId"
          className={selectClass}
          defaultValue={values.planId}
          disabled={lockBilling}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
        {lockBilling && <input type="hidden" name="planId" value={values.planId} />}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lic-seats">{label.seats}</Label>
        <Input
          id="lic-seats"
          name="seats"
          type="number"
          min={1}
          required
          defaultValue={values.seats ?? 10}
          readOnly={lockBilling}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lic-valid">{label.validUntil}</Label>
        <Input
          id="lic-valid"
          name="validUntil"
          type="date"
          defaultValue={values.validUntil ? values.validUntil.toISOString().slice(0, 10) : ""}
          disabled={lockBilling}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lic-sponsor">{label.sponsorName}</Label>
        <Input id="lic-sponsor" name="sponsorName" maxLength={120} defaultValue={values.sponsorName ?? ""} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lic-sponsor-url">{label.sponsorUrl}</Label>
        <Input
          id="lic-sponsor-url"
          name="sponsorUrl"
          maxLength={300}
          defaultValue={values.sponsorUrl ?? ""}
        />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="lic-note">{label.note}</Label>
        <textarea
          id="lic-note"
          name="note"
          rows={2}
          maxLength={2000}
          defaultValue={values.note ?? ""}
          className="rounded-md border bg-background p-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="membersCanBuyDomains"
          defaultChecked={values.membersCanBuyDomains ?? true}
        />
        {label.membersCanBuyDomains}
      </label>
    </div>
  );
}
