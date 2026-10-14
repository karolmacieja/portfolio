"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormError } from "@/components/auth/form-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createSiteAction, type SiteFormState } from "@/server/sites/actions";

type Props = {
  /** Host suffix shown in the address preview, e.g. "example.com" or "localhost:3000". */
  rootDomain: string;
  protocol: string;
};

export function CreateSiteForm({ rootDomain, protocol }: Props) {
  const t = useTranslations("sites");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [state, action, pending] = useActionState<SiteFormState, FormData>(async (prev, formData) => {
    const result = await createSiteAction(prev, formData);
    if (result.ok) {
      setName("");
      setSlug("");
      setSlugEdited(false);
    }
    return result;
  }, {});

  const errorMessage = state.error
    ? state.slugError
      ? t(`slugErrors.${state.slugError}`)
      : t(`errors.${state.error}`)
    : undefined;

  return (
    <form action={action} className="grid gap-4" data-testid="create-site-form">
      <FormError message={errorMessage} />
      {state.ok && <Alert>{t("created")}</Alert>}
      <div className="grid gap-2">
        <Label htmlFor="site-name">{t("name")}</Label>
        <Input
          id="site-name"
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="site-slug">{t("slug")}</Label>
        <Input
          id="site-slug"
          name="slug"
          required
          maxLength={40}
          pattern="[a-z0-9-]+"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value.toLowerCase());
            setSlugEdited(true);
          }}
          aria-invalid={Boolean(state.slugError) || state.error === "slugTaken"}
          aria-describedby="site-slug-hint"
        />
        <p id="site-slug-hint" className="text-sm text-muted-foreground">
          {t("slugHint", { url: `${protocol}://${slug || "…"}.${rootDomain}` })}
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("create")}
      </Button>
    </form>
  );
}
