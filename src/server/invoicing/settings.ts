import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Invoicing settings (Setting key "invoicing"), edited by admins: seller data printed on invoices,
 * the VAT rate applied to sales (prices are gross) and the exemption basis for "zw".
 */
export const sellerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(20),
  street: z.string().trim().max(200),
  postalCode: z.string().trim().max(16),
  city: z.string().trim().max(100),
  country: z.string().trim().length(2).default("PL"),
  email: z.string().trim().max(200).default(""),
  bankAccount: z.string().trim().max(40).default(""),
});

export const VAT_RATES = ["23", "8", "5", "0", "zw"] as const;

export const invoicingSettingsSchema = z.object({
  vatRate: z.enum(VAT_RATES).default("23"),
  /** Legal basis of the exemption, required for "zw" (e.g. art. 113 ust. 1 i 9 ustawy o VAT). */
  exemptionBasis: z.string().trim().max(256).default(""),
  placeOfIssue: z.string().trim().max(100).default(""),
  seller: sellerSchema.default({
    name: "Twoja Firma (uzupełnij w panelu admina)",
    taxId: "",
    street: "",
    postalCode: "",
    city: "",
    country: "PL",
    email: "",
    bankAccount: "",
  }),
});
export type InvoicingSettings = z.infer<typeof invoicingSettingsSchema>;

export const EXEMPTION_113 =
  "Zwolnienie ze względu na nieprzekroczenie limitu obrotu (art. 113 ust 1 i 9 ustawy o VAT)";

export async function getInvoicingSettings(): Promise<InvoicingSettings> {
  const row = await db.setting.findUnique({ where: { key: "invoicing" } });
  const parsed = invoicingSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : invoicingSettingsSchema.parse({});
}

export async function saveInvoicingSettings(settings: InvoicingSettings): Promise<void> {
  const value = invoicingSettingsSchema.parse(settings);
  await db.setting.upsert({
    where: { key: "invoicing" },
    update: { value },
    create: { key: "invoicing", value },
  });
}
