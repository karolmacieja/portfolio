"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";

import { saveCapacitySettings } from "./capacity";
import { saveFinanceSettings } from "./settings";

/** Finance and capacity settings (ADMIN, `settings.manage`). Money fields arrive in zł. */

const zl = z
  .string()
  .trim()
  .transform((v) => Math.round(Number(v.replace(",", ".") || "0") * 100))
  .pipe(z.number().int().min(0).max(100_000_000));

/** "Name; 123,45" per line. */
const otherCosts = z
  .string()
  .max(4000)
  .transform((text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = "", amount = ""] = line.split(";");
        return { name: name.trim(), monthly: Math.round(Number(amount.trim().replace(",", ".")) * 100) };
      }),
  )
  .pipe(
    z
      .array(z.object({ name: z.string().min(1).max(80), monthly: z.number().int().min(0).max(100_000_000) }))
      .max(30),
  );

export async function saveFinanceSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      feePercent: z
        .string()
        .transform((v) => Number(v.replace(",", ".")))
        .pipe(z.number().min(0).max(20)),
      feeFixed: zl,
      infrastructureMonthly: zl,
      infrastructureMode: z.enum(["perClient", "fixed"]),
      costPerClientMonthly: zl,
      otherCosts,
    })
    .safeParse({ otherCosts: "", ...values });
  if (!parsed.success) return { error: "finance.errors.invalid", values };
  await saveFinanceSettings(parsed.data);
  await audit(actor, "settings.finance", null, parsed.data);
  refresh();
  return { ok: true };
}

const gb = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(",", ".") || "0"))
  .pipe(z.number().min(0).max(1_000_000));

export async function saveCapacitySettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      databaseGb: gb,
      storageGb: gb,
      monthlyPageViews: z.coerce.number().int().min(0).max(10_000_000_000),
      activeSites: z.coerce.number().int().min(0).max(10_000_000),
      warnAtPercent: z.coerce.number().int().min(10).max(100),
    })
    .safeParse(values);
  if (!parsed.success) return { error: "finance.errors.invalid", values };
  await saveCapacitySettings(parsed.data);
  await audit(actor, "settings.capacity", null, parsed.data);
  refresh();
  return { ok: true };
}
