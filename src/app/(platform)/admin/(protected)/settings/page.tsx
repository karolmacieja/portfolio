import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DomainSettingsForm } from "@/components/admin/domain-admin-forms";
import { InvoicingSettingsForm } from "@/components/admin/invoice-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/session";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveBillingSettingsAction,
  saveLegalDocumentAction,
  saveMailTextAction,
} from "@/server/admin/catalog-actions";
import { getLegalDocument, LEGAL_KINDS } from "@/server/legal/service";
import { getBillingSettings } from "@/server/billing/settings";
import { getDomainSettings } from "@/server/domains/settings";
import { getMailOverrides } from "@/server/mail/overrides";
import { LINK_MAIL_KINDS } from "@/server/mail/templates";
import { getInvoicingSettings, VAT_RATES } from "@/server/invoicing/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminSettings");
  return { title: t("title") };
}

/** Platform settings (ADMIN): invoicing, billing, legal documents, mail texts, domain pricing. */
export default async function AdminSettingsPage() {
  await requirePermission("settings.manage", "/settings");
  const [settings, domainSettings, billing, overrides, terms, privacy, t] = await Promise.all([
    getInvoicingSettings(),
    getDomainSettings(),
    getBillingSettings(),
    getMailOverrides(),
    getLegalDocument("terms"),
    getLegalDocument("privacy"),
    getTranslations("adminSettings"),
  ]);
  const legal = { terms, privacy };
  const { seller } = settings;
  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("invoicing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoicingSettingsForm
            vatRates={VAT_RATES}
            initial={{
              vatRate: settings.vatRate,
              exemptionBasis: settings.exemptionBasis,
              placeOfIssue: settings.placeOfIssue,
              sellerName: seller.name,
              sellerTaxId: seller.taxId,
              sellerStreet: seller.street,
              sellerPostalCode: seller.postalCode,
              sellerCity: seller.city,
              sellerCountry: seller.country,
              sellerEmail: seller.email,
              sellerBankAccount: seller.bankAccount,
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveBillingSettingsAction}
            hidden={{}}
            label={t("save")}
            success={t("saved")}
            testId="billing-settings-form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="billing-grace">{t("gracePeriodDays")}</Label>
                <Input
                  id="billing-grace"
                  name="gracePeriodDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={billing.gracePeriodDays}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billing-reminders">{t("reminderDays")}</Label>
                <Input
                  id="billing-reminders"
                  name="reminderDays"
                  defaultValue={billing.reminderDays.join(", ")}
                />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("legal")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("legalHint")}</p>
          {LEGAL_KINDS.map((kind) => (
            <details key={kind} className="rounded-md border p-3" data-testid={`legal-${kind}`}>
              <summary className="cursor-pointer text-sm">
                {t(`legalKinds.${kind}`)} ·{" "}
                {legal[kind].isDefault
                  ? t("legalDraft")
                  : t("legalVersion", { version: legal[kind].version })}
              </summary>
              <ActionForm
                action={saveLegalDocumentAction}
                hidden={{ kind }}
                label={t("save")}
                success={t("saved")}
                className="mt-3 grid gap-2"
              >
                <textarea
                  name="content"
                  defaultValue={legal[kind].content}
                  aria-label={t(`legalKinds.${kind}`)}
                  rows={20}
                  className="rounded-md border bg-background p-2 font-mono text-xs"
                />
              </ActionForm>
            </details>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("mailTexts")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("mailTextsHint")}</p>
          {(["pl", "en"] as const).flatMap((locale) =>
            LINK_MAIL_KINDS.map((kind) => {
              const override = overrides[locale]?.[kind] ?? {};
              return (
                <details
                  key={`${locale}-${kind}`}
                  className="rounded-md border p-3"
                  open={Boolean(override.subject || override.intro || override.cta)}
                >
                  <summary className="cursor-pointer text-sm">
                    {locale.toUpperCase()} · {t(`mailKinds.${kind}`)}
                  </summary>
                  <ActionForm
                    action={saveMailTextAction}
                    hidden={{ locale, kind }}
                    label={t("save")}
                    success={t("saved")}
                    className="mt-3 grid gap-2"
                  >
                    <Input
                      name="subject"
                      defaultValue={override.subject ?? ""}
                      placeholder={t("mailSubject")}
                      aria-label={t("mailSubject")}
                      maxLength={200}
                    />
                    <textarea
                      name="intro"
                      defaultValue={override.intro ?? ""}
                      placeholder={t("mailIntro")}
                      aria-label={t("mailIntro")}
                      maxLength={2000}
                      rows={3}
                      className="rounded-md border bg-background p-2 text-sm"
                    />
                    <Input
                      name="cta"
                      defaultValue={override.cta ?? ""}
                      placeholder={t("mailCta")}
                      aria-label={t("mailCta")}
                      maxLength={100}
                    />
                  </ActionForm>
                </details>
              );
            }),
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("domains")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DomainSettingsForm
            initial={{
              tlds: domainSettings.tlds.join(", "),
              markupPercent: String(domainSettings.markupPercent),
              minMarkup: (domainSettings.minMarkup / 100).toFixed(2),
              eurRate: String(domainSettings.exchangeRates.EUR ?? 4.3),
              usdRate: String(domainSettings.exchangeRates.USD ?? 4),
              maxHostnamesPerSite: String(domainSettings.maxHostnamesPerSite),
            }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
