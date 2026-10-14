"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { ImageUrlField } from "@/components/media/image-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSiteSettingsAction, type SiteFormState } from "@/server/sites/actions";

import { FormStatus } from "./form-status";

type Props = {
  site: {
    id: string;
    name: string;
    slug: string;
    locale: string;
    description: string | null;
    noIndex: boolean;
    faviconUrl: string | null;
  };
  rootDomain: string;
};

export function SettingsForm({ site, rootDomain }: Props) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<SiteFormState, FormData>(updateSiteSettingsAction, {});

  return (
    <form action={action} className="grid max-w-2xl gap-6" data-testid="settings-form">
      <input type="hidden" name="siteId" value={site.id} />
      <div className="grid gap-2">
        <Label htmlFor="settings-name">{t("name")}</Label>
        <Input id="settings-name" name="name" defaultValue={site.name} required maxLength={80} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-slug">{t("slug")}</Label>
        <div className="flex items-center gap-2">
          <Input id="settings-slug" name="slug" defaultValue={site.slug} required maxLength={40} />
          <span className="text-sm whitespace-nowrap text-muted-foreground">.{rootDomain}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("slugWarning")}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-locale">{t("locale")}</Label>
        <select
          id="settings-locale"
          name="locale"
          defaultValue={site.locale}
          className="h-9 w-fit rounded-md border bg-background px-2 text-sm"
        >
          <option value="pl">{t("localeOption.pl")}</option>
          <option value="en">{t("localeOption.en")}</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-description">{t("description")}</Label>
        <textarea
          id="settings-description"
          name="description"
          defaultValue={site.description ?? ""}
          maxLength={300}
          className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("favicon")}</span>
        <ImageUrlField name="faviconUrl" defaultValue={site.faviconUrl} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="noIndex" defaultChecked={site.noIndex} className="size-4" />
        {t("noIndex")}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <FormStatus state={state} success={t("saved")} />
      </div>
    </form>
  );
}
