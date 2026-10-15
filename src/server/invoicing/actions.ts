"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { Role } from "@/generated/prisma/enums";
import { formValues, type ActionState } from "@/server/action-state";
import { requireRole } from "@/server/auth/session";

import { resendInvoiceToKsef, retryInvoice } from "./admin";
import { saveInvoicingSettings, VAT_RATES } from "./settings";

/** Invoice administration (ADMIN; not owner-scoped). */

const ADMIN_ONLY = [Role.ADMIN] as const;
const id = z.string().min(1).max(64);

export async function retryInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const invoiceId = id.safeParse(formData.get("invoiceId"));
  if (!invoiceId.success || !(await retryInvoice(invoiceId.data)))
    return { error: "adminInvoices.errors.notRetryable" };
  refresh();
  return { ok: true };
}

export async function resendKsefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const invoiceId = id.safeParse(formData.get("invoiceId"));
  if (!invoiceId.success) return { error: "adminInvoices.errors.notRetryable" };
  try {
    if (!(await resendInvoiceToKsef(invoiceId.data))) return { error: "adminInvoices.errors.notRetryable" };
  } catch (error) {
    console.error("KSeF resend failed", error);
    return { error: "adminInvoices.errors.providerError" };
  }
  refresh();
  return { ok: true };
}

const settingsSchema = z.object({
  vatRate: z.enum(VAT_RATES),
  exemptionBasis: z.string().trim().max(256),
  placeOfIssue: z.string().trim().max(100),
  sellerName: z.string().trim().min(1).max(200),
  sellerTaxId: z.string().trim().max(20),
  sellerStreet: z.string().trim().max(200),
  sellerPostalCode: z.string().trim().max(16),
  sellerCity: z.string().trim().max(100),
  sellerCountry: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
  sellerEmail: z.string().trim().max(200),
  sellerBankAccount: z.string().trim().max(40),
});

export async function saveInvoicingSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return { error: "adminSettings.errors.invalid", values };
  const data = parsed.data;
  await saveInvoicingSettings({
    vatRate: data.vatRate,
    exemptionBasis: data.exemptionBasis,
    placeOfIssue: data.placeOfIssue,
    seller: {
      name: data.sellerName,
      taxId: data.sellerTaxId.replace(/[\s-]/g, ""),
      street: data.sellerStreet,
      postalCode: data.sellerPostalCode,
      city: data.sellerCity,
      country: data.sellerCountry.toUpperCase(),
      email: data.sellerEmail,
      bankAccount: data.sellerBankAccount,
    },
  });
  refresh();
  return { ok: true, values };
}
