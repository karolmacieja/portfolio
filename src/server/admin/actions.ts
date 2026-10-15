"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { hasPermission } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/session";
import { invalidateTags } from "@/server/sites/invalidate";

import * as clients from "./clients";

/** Staff actions on clients (not owner-scoped; permission-checked and audited). */

const id = z.string().min(1).max(64);

async function run(fn: () => Promise<unknown>, values?: Record<string, string>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof clients.AdminError) return { error: `adminClients.errors.${error.code}`, values };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function addClientNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("clients.manage");
  const userId = id.safeParse(formData.get("userId"));
  const body = z.string().trim().min(1).max(2000).safeParse(formData.get("body"));
  if (!userId.success || !body.success) return { error: "adminClients.errors.invalid" };
  return run(async () => {
    const note = await clients.addClientNote(actor.id, userId.data, body.data);
    await audit(actor, "client.note", { type: "User", id: userId.data }, { noteId: note.id });
  });
}

export async function setClientBlockedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("clients.manage");
  const userId = id.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "adminClients.errors.notFound" };
  const blocked = formData.get("blocked") === "1";
  return run(async () => {
    await clients.setClientBlocked(
      { id: actor.id, canManageStaff: hasPermission(actor.role, "staff.manage") },
      userId.data,
      blocked,
    );
    await audit(actor, blocked ? "client.block" : "client.unblock", { type: "User", id: userId.data });
  });
}

export async function grantPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.grant");
  const values = formValues(formData);
  const parsed = z
    .object({
      userId: id,
      planId: id,
      until: z
        .string()
        .trim()
        .transform((value) => (value ? new Date(`${value}T23:59:59`) : null))
        .refine((value) => value === null || (!Number.isNaN(value.getTime()) && value > new Date())),
    })
    .safeParse({ until: "", ...values });
  if (!parsed.success) return { error: "adminClients.errors.invalid", values };
  return run(async () => {
    invalidateTags(await clients.grantPlan(parsed.data.userId, parsed.data.planId, parsed.data.until));
    await audit(
      actor,
      "client.plan.grant",
      { type: "User", id: parsed.data.userId },
      {
        planId: parsed.data.planId,
        until: parsed.data.until?.toISOString() ?? null,
      },
    );
  }, values);
}

export async function revokeManualPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.grant");
  const userId = id.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "adminClients.errors.notFound" };
  return run(async () => {
    invalidateTags(await clients.revokeManualPlan(userId.data));
    await audit(actor, "client.plan.revoke", { type: "User", id: userId.data });
  });
}

export async function refundPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("payments.refund");
  const values = formValues(formData);
  const paymentId = id.safeParse(values.paymentId);
  const amount = z
    .string()
    .trim()
    .transform((value) => (value ? Math.round(Number(value.replace(",", ".")) * 100) : null))
    .pipe(z.number().int().positive().nullable())
    .safeParse(values.amount ?? "");
  if (!paymentId.success || !amount.success) return { error: "adminClients.errors.refundAmount", values };
  return run(async () => {
    const result = await clients.refundPayment(paymentId.data, amount.data);
    await audit(
      actor,
      "payment.refund",
      { type: "Payment", id: paymentId.data },
      {
        amount: result.amount,
        userId: result.payment.userId,
      },
    );
  }, values);
}
