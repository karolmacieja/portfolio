import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setUserRoleAction } from "@/server/admin/catalog-actions";
import { listStaff } from "@/server/admin/staff";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminStaff");
  return { title: t("title") };
}

/** Panel team (ADMIN): grant ADMIN/SUPPORT to an existing account, change or remove roles. */
export default async function AdminStaffPage() {
  const actor = await requirePermission("staff.manage", "/staff");
  const [staff, t] = await Promise.all([listStaff(), getTranslations("adminStaff")]);
  const roleSelect = (value: string) => (
    <select
      name="role"
      defaultValue={value}
      aria-label={t("role")}
      className="h-8 rounded-md border bg-background px-2 text-sm"
    >
      {(["ADMIN", "SUPPORT", "CLIENT"] as const).map((role) => (
        <option key={role} value={role}>
          {t(`roles.${role}`)}
        </option>
      ))}
    </select>
  );
  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("add")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={setUserRoleAction}
            hidden={{}}
            label={t("grant")}
            success={t("saved")}
            className="flex flex-wrap items-end gap-2"
            testId="add-staff-form"
          >
            <Input
              name="email"
              type="email"
              required
              placeholder={t("email")}
              aria-label={t("email")}
              className="h-8 w-64"
            />
            {roleSelect("SUPPORT")}
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">{t("hint")}</p>
        </CardContent>
      </Card>
      <ul className="grid gap-2" data-testid="staff">
        {staff.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <span>
              {member.email} <Badge variant="outline">{t(`roles.${member.role}`)}</Badge>
              {member.blockedAt && <Badge variant="destructive">{t("blocked")}</Badge>}
            </span>
            {member.id !== actor.id && (
              <ActionForm
                action={setUserRoleAction}
                hidden={{ email: member.email }}
                label={t("change")}
                className="flex items-center gap-2"
              >
                {roleSelect(member.role)}
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
