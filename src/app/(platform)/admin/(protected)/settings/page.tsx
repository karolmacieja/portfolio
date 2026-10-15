import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { InvoicingSettingsForm } from "@/components/admin/invoice-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/server/auth/session";
import { getInvoicingSettings, VAT_RATES } from "@/server/invoicing/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminSettings");
  return { title: t("title") };
}

/** Platform settings (ADMIN). Phase 6: invoicing (VAT rate, seller data); more in Phase 8. */
export default async function AdminSettingsPage() {
  await requireRole([Role.ADMIN], "/settings");
  const [settings, t] = await Promise.all([getInvoicingSettings(), getTranslations("adminSettings")]);
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
    </main>
  );
}
