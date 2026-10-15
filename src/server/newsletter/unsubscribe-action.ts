"use server";

import { getEnv } from "@/lib/env";
import { verifySignedToken } from "@/lib/signed-token";
import type { ActionState } from "@/server/action-state";

import { UNSUBSCRIBE_PURPOSE } from "./render";
import { unsubscribe } from "./sending";

/** The unsubscribe page's button (no session needed: the signed token identifies the recipient). */
export async function unsubscribeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const payload = verifySignedToken<{ userId: string; campaignId: string | null }>(
    String(formData.get("token") ?? ""),
    getEnv().AUTH_SECRET,
    UNSUBSCRIBE_PURPOSE,
  );
  if (!payload) return { error: "newsletter.errors.unsubscribeInvalid" };
  await unsubscribe(payload.userId, payload.campaignId);
  return { ok: true };
}
