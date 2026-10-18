"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import {
  applyTemplateThemeAction,
  detachTemplateAction,
  restoreBackupAction,
  switchSiteTemplateAction,
} from "@/server/templates/client-actions";

export function SiteTemplateActions({
  siteId,
  templateId,
  templateName,
}: {
  siteId: string;
  templateId: string;
  templateName: string;
}) {
  const t = useTranslations("templates");
  const [themeState, applyTheme, applyingTheme] = useActionState<ActionState, FormData>(
    applyTemplateThemeAction,
    {},
  );
  const [layoutState, switchLayout, switching] = useActionState<ActionState, FormData>(
    switchSiteTemplateAction,
    {},
  );
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={applyTheme}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="templateId" value={templateId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={applyingTheme}
            title={t("applyThemeHint")}
          >
            {t("applyTheme")}
          </Button>
        </form>
        <form
          action={switchLayout}
          onSubmit={(e) => !confirm(t("switchConfirm", { name: templateName })) && e.preventDefault()}
        >
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="templateId" value={templateId} />
          <Button type="submit" size="sm" disabled={switching} title={t("switchLayoutHint")}>
            {t("switchLayout")}
          </Button>
        </form>
      </div>
      <FormMessage state={themeState} success={t("themeApplied")} />
      <FormMessage state={layoutState} success={t("layoutSwitched")} />
    </div>
  );
}

export function RestoreBackupButton({ backupId }: { backupId: string }) {
  const t = useTranslations("templates");
  const [state, action, pending] = useActionState<ActionState, FormData>(restoreBackupAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => !confirm(t("restoreConfirm")) && e.preventDefault()}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="backupId" value={backupId} />
      <FormMessage state={state} success={t("restored")} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("restoreBackup")}
      </Button>
    </form>
  );
}

/** Removes the template's block locks (after a backup) so every block can be edited freely. */
export function DetachTemplateButton({ siteId }: { siteId: string }) {
  const t = useTranslations("templates");
  const [state, action, pending] = useActionState<ActionState, FormData>(detachTemplateAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => !confirm(t("detachConfirm")) && e.preventDefault()}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="siteId" value={siteId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} data-testid="detach-template">
        {t("detach")}
      </Button>
      <FormMessage state={state} success={t("detached")} />
    </form>
  );
}
