"use client";

import { useTranslations } from "next-intl";

import type { ActionState } from "@/server/action-state";

/** Success/error line for forms backed by `ActionState` actions. */
export function FormMessage({ state, success }: { state: ActionState; success?: string }) {
  const t = useTranslations() as unknown as (key: string, values?: Record<string, string>) => string;
  if (state.ok && success) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {success}
      </p>
    );
  }
  if (!state.error) return null;
  return (
    <p className="text-sm text-destructive" role="alert" data-testid="form-error">
      {t(state.error, state.errorValues)}
    </p>
  );
}
