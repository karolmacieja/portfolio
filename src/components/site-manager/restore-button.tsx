"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { restoreVersionAction, type SiteFormState } from "@/server/sites/actions";

import { FormStatus } from "./form-status";

export function RestoreButton({ versionId }: { versionId: string }) {
  const t = useTranslations("history");
  const [state, action, pending] = useActionState<SiteFormState, FormData>(restoreVersionAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="versionId" value={versionId} />
      <FormStatus state={state} success={t("restored")} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("restore")}
      </Button>
    </form>
  );
}
