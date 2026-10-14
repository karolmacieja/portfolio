"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { publishSiteAction, type SiteFormState } from "@/server/sites/actions";

export function PublishButton({ siteId, republish }: { siteId: string; republish: boolean }) {
  const t = useTranslations("sites");
  const [state, action, pending] = useActionState<SiteFormState, FormData>(publishSiteAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="siteId" value={siteId} />
      <Button type="submit" size="sm" disabled={pending}>
        {republish ? t("republish") : t("publish")}
      </Button>
      {state.error && <span className="text-sm text-destructive">{t(`errors.${state.error}`)}</span>}
      {state.ok && <span className="text-sm text-muted-foreground">{t("published")}</span>}
    </form>
  );
}
