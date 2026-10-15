import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { LicenseFields } from "@/components/admin/license-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { listOrganizations } from "@/server/licenses/admin";
import { createManualLicenseAction } from "@/server/licenses/admin-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminLicenses");
  return { title: t("title") };
}

/** Group licenses: self-service ones (paid per seat) and manual ones for agreed deals. */
export default async function AdminLicensesPage() {
  await requirePermission("licenses.manage", "/licenses");
  const [organizations, plans, t, tStatus, format] = await Promise.all([
    listOrganizations(),
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getTranslations("adminLicenses"),
    getTranslations("licenses.status"),
    getFormatter(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="admin-licenses">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">{t("name")}</th>
                  <th>{t("plan")}</th>
                  <th>{t("seats")}</th>
                  <th>{t("source")}</th>
                  <th>{t("status")}</th>
                  <th>{t("manager")}</th>
                  <th>{t("created")}</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-t">
                    <td className="py-2">
                      <Link
                        href={`/licenses/${org.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td>{org.plan.name}</td>
                    <td>
                      {org._count.members} / {org.seats}
                    </td>
                    <td>{t(`sources.${org.source}`)}</td>
                    <td>
                      <Badge variant={org.status === "ACTIVE" ? "secondary" : "outline"}>
                        {tStatus(org.status)}
                      </Badge>
                    </td>
                    <td>{org.manager?.email ?? "—"}</td>
                    <td>{format.dateTime(org.createdAt, { dateStyle: "medium" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("createManual")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={createManualLicenseAction}
            hidden={{}}
            label={t("create")}
            variant="default"
            className="grid gap-4"
            testId="manual-license-form"
          >
            <p className="text-sm text-muted-foreground">{t("manualHint")}</p>
            <div className="grid gap-1">
              <Label htmlFor="lic-manager">{t("managerEmail")}</Label>
              <Input id="lic-manager" name="managerEmail" type="email" required />
            </div>
            <LicenseFields plans={plans} />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
