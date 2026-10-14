"use client";

import { useTranslations } from "next-intl";

import type { SiteFormState } from "@/server/sites/actions";

/** Success/error line for site forms; error codes map to `sites.errors.*` / `sites.slugErrors.*`. */
export function FormStatus({ state, success }: { state: SiteFormState; success: string }) {
  const t = useTranslations("sites");
  if (state.ok)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {success}
      </p>
    );
  if (!state.error) return null;
  const message = state.slugError
    ? t(`slugErrors.${state.slugError}`)
    : t(`errors.${state.error}` as "errors.generic");
  return (
    <p className="text-sm text-destructive" role="alert" data-testid="form-error">
      {message}
    </p>
  );
}
