"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { formValues, type ActionState } from "@/server/action-state";
import { requireUser } from "@/server/auth/session";

import { deleteContactMessage, setMessageRead } from "./service";

const messageSchema = z.object({ messageId: z.string().min(1).max(64), read: z.enum(["0", "1"]).optional() });

export async function setMessageReadAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/messages");
  const parsed = messageSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "messages.errors.notFound" };
  if (!(await setMessageRead(user.id, parsed.data.messageId, parsed.data.read !== "0"))) {
    return { error: "messages.errors.notFound" };
  }
  refresh();
  return { ok: true };
}

export async function deleteMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/messages");
  const parsed = messageSchema.safeParse(formValues(formData));
  if (!parsed.success || !(await deleteContactMessage(user.id, parsed.data.messageId))) {
    return { error: "messages.errors.notFound" };
  }
  refresh();
  return { ok: true };
}
