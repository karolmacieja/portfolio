"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createPageAction, type SiteFormState } from "@/server/sites/actions";

import { FormStatus } from "./form-status";

export function AddPageForm({ siteId }: { siteId: string }) {
  const t = useTranslations("pages");
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [edited, setEdited] = useState(false);
  const [state, action, pending] = useActionState<SiteFormState, FormData>(async (prev, formData) => {
    const result = await createPageAction(prev, formData);
    if (result.ok) {
      setTitle("");
      setPath("");
      setEdited(false);
    }
    return result;
  }, {});

  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      data-testid="add-page-form"
    >
      <input type="hidden" name="siteId" value={siteId} />
      <div className="grid gap-2">
        <Label htmlFor="new-page-title">{t("pageTitle")}</Label>
        <Input
          id="new-page-title"
          name="title"
          required
          maxLength={120}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!edited) setPath(slugify(event.target.value));
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-page-path">{t("path")}</Label>
        <Input
          id="new-page-path"
          name="path"
          required
          maxLength={100}
          placeholder={t("pathHint")}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setEdited(true);
          }}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("add")}
      </Button>
      <div className="sm:col-span-3">
        <FormStatus state={state} success={t("added")} />
      </div>
    </form>
  );
}
