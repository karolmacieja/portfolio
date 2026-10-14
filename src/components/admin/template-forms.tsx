"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { ImageUrlField } from "@/components/media/image-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  addTemplateOverrideAction,
  addTemplatePageAction,
  createTemplateAction,
  publishTemplateAction,
  setTemplateStatusAction,
  updateTemplateMetaAction,
} from "@/server/templates/actions";
import { TEMPLATE_CATEGORIES } from "@/server/templates/schema";

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

function CategorySelect({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations("templates.categories");
  return (
    <select
      name="category"
      defaultValue={defaultValue ?? "other"}
      className={selectClass}
      id="template-category"
    >
      {TEMPLATE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {t(c)}
        </option>
      ))}
    </select>
  );
}

export function CreateTemplateForm() {
  const t = useTranslations("adminTemplates");
  const [state, action, pending] = useActionState<ActionState, FormData>(createTemplateAction, {});
  return (
    <form
      action={action}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      data-testid="create-template-form"
    >
      <div className="grid gap-2">
        <Label htmlFor="template-name">{t("name")}</Label>
        <Input id="template-name" name="name" required maxLength={80} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="template-slug">{t("slug")}</Label>
        <Input id="template-slug" name="slug" required maxLength={60} pattern="[a-z0-9-]+" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="template-category">{t("category")}</Label>
        <CategorySelect />
      </div>
      <Button type="submit" disabled={pending}>
        {t("create")}
      </Button>
      <div className="sm:col-span-4">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export type TemplateMeta = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  tags: string[];
  accessTier: string;
  position: number;
  isNew: boolean;
  isFeatured: boolean;
  isPremium: boolean;
  priceAmount: number | null;
  thumbnailUrl: string | null;
};

export function TemplateMetaForm({ template }: { template: TemplateMeta }) {
  const t = useTranslations("adminTemplates");
  const tPlans = useTranslations("plans.tiers");
  const [state, action, pending] = useActionState<ActionState, FormData>(updateTemplateMetaAction, {});
  return (
    <form action={action} className="grid gap-4" data-testid="template-meta-form">
      <input type="hidden" name="templateId" value={template.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="meta-name">{t("name")}</Label>
          <Input id="meta-name" name="name" defaultValue={template.name} required maxLength={80} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meta-slug">{t("slug")}</Label>
          <Input id="meta-slug" name="slug" defaultValue={template.slug} required maxLength={60} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="template-category">{t("category")}</Label>
          <CategorySelect defaultValue={template.category} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meta-tier">{t("tier")}</Label>
          <select id="meta-tier" name="accessTier" defaultValue={template.accessTier} className={selectClass}>
            {(["basic", "pro", "business"] as const).map((tier) => (
              <option key={tier} value={tier}>
                {tPlans(tier)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meta-tags">{t("tags")}</Label>
          <Input id="meta-tags" name="tags" defaultValue={template.tags.join(", ")} maxLength={300} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meta-position">{t("position")}</Label>
          <Input id="meta-position" name="position" type="number" min={0} defaultValue={template.position} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="meta-description">{t("description")}</Label>
        <textarea
          id="meta-description"
          name="description"
          defaultValue={template.description ?? ""}
          maxLength={500}
          className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        {(["isNew", "isFeatured", "isPremium"] as const).map((flag) => (
          <label key={flag} className="flex items-center gap-2">
            <input type="checkbox" name={flag} defaultChecked={template[flag]} />
            {t(flag)}
          </label>
        ))}
      </div>
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="meta-price">{t("price")}</Label>
        <Input
          id="meta-price"
          name="price"
          inputMode="decimal"
          defaultValue={template.priceAmount ? (template.priceAmount / 100).toFixed(2) : ""}
        />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("thumbnail")}</span>
        <ImageUrlField name="thumbnailUrl" defaultValue={template.thumbnailUrl} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <FormMessage state={state} success={t("saved")} />
      </div>
    </form>
  );
}

export function AddTemplatePageForm({ templateId }: { templateId: string }) {
  const t = useTranslations("adminTemplates");
  const [state, action, pending] = useActionState<ActionState, FormData>(addTemplatePageAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="templateId" value={templateId} />
      <div className="grid gap-2">
        <Label htmlFor="tpl-page-title">{t("pageTitle")}</Label>
        <Input id="tpl-page-title" name="title" required maxLength={120} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tpl-page-path">{t("pagePath")}</Label>
        <Input id="tpl-page-path" name="path" required maxLength={100} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t("addPage")}
      </Button>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function TemplatePublishControls({ templateId, status }: { templateId: string; status: string }) {
  const t = useTranslations("adminTemplates");
  const [publishState, publish, publishing] = useActionState<ActionState, FormData>(
    publishTemplateAction,
    {},
  );
  const [statusState, setStatus, settingStatus] = useActionState<ActionState, FormData>(
    setTemplateStatusAction,
    {},
  );
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={publish}>
          <input type="hidden" name="templateId" value={templateId} />
          <Button type="submit" disabled={publishing} data-testid="template-publish">
            {t("publish")}
          </Button>
        </form>
        {status !== "DRAFT" && (
          <form action={setStatus}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="status" value={status === "ARCHIVED" ? "PUBLISHED" : "ARCHIVED"} />
            <Button type="submit" variant="outline" disabled={settingStatus}>
              {status === "ARCHIVED" ? t("unarchive") : t("archive")}
            </Button>
          </form>
        )}
      </div>
      <FormMessage state={publishState} success={t("published")} />
      <FormMessage state={statusState} />
    </div>
  );
}

export function AddOverrideForm({
  templateId,
  plans,
}: {
  templateId: string;
  plans: { id: string; name: string }[];
}) {
  const t = useTranslations("adminTemplates");
  const [state, action, pending] = useActionState<ActionState, FormData>(addTemplateOverrideAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="templateId" value={templateId} />
      <div className="grid gap-2">
        <Label htmlFor="override-plan">{t("overridePlan")}</Label>
        <select id="override-plan" name="planId" className={selectClass} defaultValue="">
          <option value="">—</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="override-user">{t("overrideUser")}</Label>
        <Input id="override-user" name="userEmail" type="email" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t("addOverride")}
      </Button>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
