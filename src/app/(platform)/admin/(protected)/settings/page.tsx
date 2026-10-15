import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { DomainSettingsForm } from "@/components/admin/domain-admin-forms";
import { InvoicingSettingsForm } from "@/components/admin/invoice-forms";
import { Button } from "@/components/ui/button";
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
import { saveSponsorSettingsAction } from "@/server/licenses/admin-actions";
import { getSponsorSettings } from "@/server/licenses/settings";
import { saveCapacitySettingsAction, saveFinanceSettingsAction } from "@/server/finance/actions";
import { getCapacitySettings } from "@/server/finance/capacity";
import { getFinanceSettings } from "@/server/finance/settings";
import { getBillingSettings } from "@/server/billing/settings";
import { getDomainSettings } from "@/server/domains/settings";
import { saveMailBrandingAction } from "@/server/mail/actions";
import { getMailBrandingSettings } from "@/server/mail/branding";
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
  const [sponsor, finance, capacity, mailBranding] = await Promise.all([
    getSponsorSettings(),
    getFinanceSettings(),
    getCapacitySettings(),
    getMailBrandingSettings(),
  ]);
  const zl = (grosze: number) => (grosze / 100).toFixed(2);
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
          <CardTitle>{t("finance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveFinanceSettingsAction}
            hidden={{}}
            label={t("save")}
            success={t("saved")}
            className="grid gap-3"
            testId="finance-settings-form"
          >
            <p className="text-sm text-muted-foreground">{t("financeHint")}</p>
            <div className="flex flex-wrap gap-3">
              <div className="grid gap-1">
                <Label htmlFor="fin-fee">{t("feePercent")}</Label>
                <Input
                  id="fin-fee"
                  name="feePercent"
                  inputMode="decimal"
                  defaultValue={finance.feePercent}
                  className="w-24"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="fin-fixed">{t("feeFixed")}</Label>
                <Input
                  id="fin-fixed"
                  name="feeFixed"
                  inputMode="decimal"
                  defaultValue={zl(finance.feeFixed)}
                  className="w-24"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="fin-infra">{t("infrastructureMonthly")}</Label>
                <Input
                  id="fin-infra"
                  name="infrastructureMonthly"
                  inputMode="decimal"
                  defaultValue={zl(finance.infrastructureMonthly)}
                  className="w-28"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="fin-mode">{t("infrastructureMode")}</Label>
                <select
                  id="fin-mode"
                  name="infrastructureMode"
                  defaultValue={finance.infrastructureMode}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="perClient">{t("infrastructureModes.perClient")}</option>
                  <option value="fixed">{t("infrastructureModes.fixed")}</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="fin-per-client">{t("costPerClientMonthly")}</Label>
                <Input
                  id="fin-per-client"
                  name="costPerClientMonthly"
                  inputMode="decimal"
                  defaultValue={zl(finance.costPerClientMonthly)}
                  className="w-24"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="fin-other">{t("otherCosts")}</Label>
              <textarea
                id="fin-other"
                name="otherCosts"
                rows={4}
                defaultValue={finance.otherCosts.map((c) => `${c.name}; ${zl(c.monthly)}`).join("\n")}
                placeholder={t("otherCostsPlaceholder")}
                className="rounded-md border bg-background p-2 font-mono text-xs"
              />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("capacity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveCapacitySettingsAction}
            hidden={{}}
            label={t("save")}
            success={t("saved")}
            className="grid gap-3"
            testId="capacity-settings-form"
          >
            <p className="text-sm text-muted-foreground">{t("capacityHint")}</p>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["databaseGb", capacity.databaseGb],
                  ["storageGb", capacity.storageGb],
                  ["monthlyPageViews", capacity.monthlyPageViews],
                  ["activeSites", capacity.activeSites],
                  ["warnAtPercent", capacity.warnAtPercent],
                ] as const
              ).map(([name, value]) => (
                <div key={name} className="grid gap-1">
                  <Label htmlFor={`cap-${name}`}>{t(`capacityFields.${name}`)}</Label>
                  <Input
                    id={`cap-${name}`}
                    name={name}
                    inputMode="decimal"
                    defaultValue={value}
                    className="w-32"
                  />
                </div>
              ))}
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sponsor")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveSponsorSettingsAction}
            hidden={{}}
            label={t("save")}
            success={t("saved")}
            className="grid gap-3"
            testId="sponsor-settings-form"
          >
            <p className="text-sm text-muted-foreground">{t("sponsorHint")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={sponsor.enabled} />
              {t("sponsorEnabled")}
            </label>
            <div className="flex flex-wrap gap-3">
              <div className="grid gap-1">
                <Label htmlFor="sponsor-mode">{t("sponsorMode")}</Label>
                <select
                  id="sponsor-mode"
                  name="mode"
                  defaultValue={sponsor.mode}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="MONTHLY">{t("sponsorModes.MONTHLY")}</option>
                  <option value="ONCE">{t("sponsorModes.ONCE")}</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sponsor-amount">{t("sponsorAmount")}</Label>
                <Input
                  id="sponsor-amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={(sponsor.amount / 100).toFixed(2)}
                  className="w-28"
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
          <CardTitle>{t("mailBranding")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ActionForm
            action={saveMailBrandingAction}
            hidden={{}}
            label={t("save")}
            success={t("saved")}
            className="grid gap-3"
            testId="mail-branding-form"
          >
            <p className="text-sm text-muted-foreground">{t("mailBrandingHint")}</p>
            <div className="flex flex-wrap gap-3">
              <div className="grid gap-1">
                <Label htmlFor="mail-logo">{t("mailLogo")}</Label>
                <Input
                  id="mail-logo"
                  name="logoUrl"
                  type="url"
                  defaultValue={mailBranding.logoUrl}
                  placeholder="https://"
                  className="w-80"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="mail-accent">{t("mailAccent")}</Label>
                <Input
                  id="mail-accent"
                  name="accentColor"
                  type="color"
                  defaultValue={mailBranding.accentColor}
                  className="h-9 w-20 p-1"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="mail-footer">{t("mailFooter")}</Label>
              <textarea
                id="mail-footer"
                name="footerText"
                rows={4}
                maxLength={1000}
                defaultValue={mailBranding.footerText}
                placeholder={t("mailFooterPlaceholder")}
                className="rounded-md border bg-background p-2 text-sm"
              />
            </div>
          </ActionForm>
          <div>
            <Button asChild size="sm" variant="outline">
              <Link href="/mail-preview">{t("mailPreview")}</Link>
            </Button>
          </div>
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
