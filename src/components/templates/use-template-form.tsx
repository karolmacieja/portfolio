"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import type { ActionState } from "@/server/action-state";
import { createSiteFromTemplateAction } from "@/server/templates/client-actions";

export function UseTemplateForm({
  templateId,
  rootDomain,
  protocol,
}: {
  templateId: string;
  rootDomain: string;
  protocol: string;
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ActionState, FormData>(createSiteFromTemplateAction, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);

  return (
    <form action={action} className="grid max-w-lg gap-4" data-testid="use-template-form">
      <input type="hidden" name="templateId" value={templateId} />
      <div className="grid gap-2">
        <Label htmlFor="tpl-site-name">{t("sites.name")}</Label>
        <Input
          id="tpl-site-name"
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!edited) setSlug(slugify(event.target.value));
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tpl-site-slug">{t("sites.slug")}</Label>
        <Input
          id="tpl-site-slug"
          name="slug"
          required
          maxLength={40}
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value.toLowerCase());
            setEdited(true);
          }}
        />
        <p className="text-sm text-muted-foreground">
          {t("sites.slugHint", { url: `${protocol}://${slug || "…"}.${rootDomain}` })}
        </p>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-fit">
        {t("templates.create")}
      </Button>
    </form>
  );
}
