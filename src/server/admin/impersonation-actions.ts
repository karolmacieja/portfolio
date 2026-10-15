"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { platformUrl } from "@/lib/env";
import type { ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { getCurrentUser, requirePermission } from "@/server/auth/session";

import { AdminError } from "./clients";
import { endImpersonation, startImpersonation } from "./impersonation";

/** Admin host: starts a session as the client (reason required) and opens the app host. */
export async function startImpersonationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("clients.impersonate");
  const userId = z.string().min(1).max(64).safeParse(formData.get("userId"));
  const reason = z.string().trim().min(3).max(300).safeParse(formData.get("reason"));
  if (!userId.success || !reason.success) return { error: "adminClients.errors.reasonRequired" };
  let url: string;
  try {
    const started = await startImpersonation(actor, userId.data, reason.data);
    await audit(
      actor,
      "client.impersonate.start",
      { type: "User", id: userId.data },
      {
        reason: reason.data,
        sessionId: started.session.id,
      },
    );
    url = started.url;
  } catch (error) {
    if (error instanceof AdminError) return { error: `adminClients.errors.${error.code}` };
    throw error;
  }
  redirect(url);
}

/** App host: redeems the token (button on the confirmation page; tokens are never redeemed by GET). */
export async function completeImpersonationAction(formData: FormData): Promise<void> {
  const token = z.string().min(10).max(2000).parse(formData.get("token"));
  await signIn("impersonation", { token, redirectTo: "/dashboard" });
}

/** App host banner: ends the session and returns to the admin panel. */
export async function endImpersonationAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user?.impersonation) {
    await endImpersonation(user.impersonation.sessionId);
    await audit(
      null,
      "client.impersonate.end",
      { type: "User", id: user.id },
      {
        sessionId: user.impersonation.sessionId,
        admin: user.impersonation.adminEmail,
      },
    );
  }
  // Auth.js only redirects within the current host; the admin panel is another host.
  await signOut({ redirect: false });
  redirect(platformUrl("admin", "/clients"));
}
