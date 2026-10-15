import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { joinOrganizationAction } from "@/server/licenses/actions";
import { describeJoin, getMembership } from "@/server/licenses/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("licenses");
  return { title: t("joinTitle") };
}

/** Joining a group license from the shareable link (`?code=`) or an e-mail invitation (`?invite=`). */
export default async function JoinPage({ searchParams }: PageProps<"/panel/join">) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : undefined;
  const invite = typeof params.invite === "string" ? params.invite : undefined;
  const query = code ? `code=${encodeURIComponent(code)}` : `invite=${encodeURIComponent(invite ?? "")}`;
  const user = await requireUser(`/join?${query}`);
  const [t, join, membership] = await Promise.all([
    getTranslations("licenses"),
    describeJoin({ ...(code ? { code } : {}), ...(invite ? { invite } : {}) }),
    getMembership(user.id),
  ]);

  return (
    <main className="mx-auto grid max-w-md gap-4 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t("joinTitle")}</CardTitle>
          {join && (
            <CardDescription>
              {t("joinDescription", {
                organization: join.organization.name,
                plan: join.organization.plan.name,
              })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {!join ? (
            <Alert variant="destructive">{t("errors.inviteInvalid")}</Alert>
          ) : membership ? (
            <Alert>{t("errors.alreadyMember")}</Alert>
          ) : (
            <ActionForm
              action={joinOrganizationAction}
              hidden={{ ...(code ? { code } : {}), ...(invite ? { invite } : {}) }}
              label={t("joinButton", { organization: join.organization.name })}
              variant="default"
              testId="join-form"
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
