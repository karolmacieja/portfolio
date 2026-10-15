import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isLocale } from "@/i18n/config";
import { requirePermission } from "@/server/auth/session";
import { sendTestMailAction } from "@/server/mail/actions";
import { sampleMail } from "@/server/mail/samples";
import { LINK_MAIL_KINDS } from "@/server/mail/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminSettings");
  return { title: t("mailPreview") };
}

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

/** Preview of any transactional mail with the current branding and texts, plus a test send to yourself. */
export default async function MailPreviewPage({ searchParams }: PageProps<"/admin/mail-preview">) {
  const actor = await requirePermission("settings.manage", "/mail-preview");
  const params = await searchParams;
  const kind = LINK_MAIL_KINDS.find((k) => k === params.kind) ?? "verifyEmail";
  const locale = typeof params.locale === "string" && isLocale(params.locale) ? params.locale : "pl";
  const [t, mail] = await Promise.all([
    getTranslations("adminSettings"),
    sampleMail(kind, locale, actor.email),
  ]);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("mailPreview")}</h1>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <select name="kind" defaultValue={kind} className={selectClass} aria-label={t("mailTexts")}>
          {LINK_MAIL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`mailKinds.${k}`)}
            </option>
          ))}
        </select>
        <select name="locale" defaultValue={locale} className={selectClass} aria-label="locale">
          <option value="pl">PL</option>
          <option value="en">EN</option>
        </select>
        <Button type="submit" size="sm" variant="outline">
          {t("showPreview")}
        </Button>
      </form>
      <Card>
        <CardHeader>
          <CardTitle className="text-base" data-testid="preview-subject">
            {mail.subject}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <iframe
            title={t("mailPreview")}
            srcDoc={mail.html}
            sandbox=""
            className="h-[640px] w-full rounded-md border bg-white"
            data-testid="mail-preview"
          />
          <ActionForm
            action={sendTestMailAction}
            hidden={{ kind, locale }}
            label={t("sendTest", { email: actor.email })}
            success={t("testSent")}
            testId="send-test-mail"
          />
        </CardContent>
      </Card>
    </main>
  );
}
