"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { ImageUrlField } from "@/components/media/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deletePageAction,
  movePageAction,
  updatePageMetaAction,
  type SiteFormState,
} from "@/server/sites/actions";

import { FormStatus } from "./form-status";

export type PageRowData = {
  id: string;
  /** Shown in the list (home page gets a suffix); `title` is the editable value. */
  label: string;
  title: string;
  path: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  published: boolean;
  hasUnpublishedChanges: boolean;
};

export function PageRow({
  page,
  editHref,
  isFirst,
  isLast,
}: {
  page: PageRowData;
  editHref: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("pages");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SiteFormState, FormData>(updatePageMetaAction, {});
  const isHome = page.path === "";

  return (
    <li className="rounded-lg border" data-testid={`page-${page.path || "home"}`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="mr-auto grid">
          <span className="font-medium">{page.label}</span>
          <span className="text-sm text-muted-foreground">/{page.path}</span>
        </div>
        {!page.published ? (
          <Badge variant="outline">{t("statusDraft")}</Badge>
        ) : page.hasUnpublishedChanges ? (
          <Badge variant="outline">{t("statusChanges")}</Badge>
        ) : (
          <Badge variant="secondary">{t("statusLive")}</Badge>
        )}
        <Button asChild size="sm">
          <Link href={editHref}>{t("edit")}</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {t("details")}
        </Button>
        <form action={movePageAction} className="flex">
          <input type="hidden" name="pageId" value={page.id} />
          <Button
            type="submit"
            name="direction"
            value="up"
            size="icon"
            variant="ghost"
            disabled={isFirst}
            aria-label={t("moveUp")}
          >
            ↑
          </Button>
          <Button
            type="submit"
            name="direction"
            value="down"
            size="icon"
            variant="ghost"
            disabled={isLast}
            aria-label={t("moveDown")}
          >
            ↓
          </Button>
        </form>
        {!isHome && (
          <form
            action={deletePageAction}
            onSubmit={(event) => !confirm(t("deleteConfirm")) && event.preventDefault()}
          >
            <input type="hidden" name="pageId" value={page.id} />
            <Button type="submit" size="sm" variant="ghost" className="text-destructive">
              {t("delete")}
            </Button>
          </form>
        )}
      </div>
      {open && (
        <form action={action} className="grid gap-4 border-t p-4">
          <input type="hidden" name="pageId" value={page.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`title-${page.id}`}>{t("pageTitle")}</Label>
              <Input
                id={`title-${page.id}`}
                name="title"
                defaultValue={page.title}
                required
                maxLength={120}
              />
            </div>
            {!isHome && (
              <div className="grid gap-2">
                <Label htmlFor={`path-${page.id}`}>{t("path")}</Label>
                <Input id={`path-${page.id}`} name="path" defaultValue={page.path} required maxLength={100} />
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`seoTitle-${page.id}`}>{t("seoTitle")}</Label>
            <Input
              id={`seoTitle-${page.id}`}
              name="seoTitle"
              defaultValue={page.seoTitle ?? ""}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">{t("seoTitleHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`seoDescription-${page.id}`}>{t("seoDescription")}</Label>
            <textarea
              id={`seoDescription-${page.id}`}
              name="seoDescription"
              defaultValue={page.seoDescription ?? ""}
              maxLength={300}
              className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">{t("seoDescriptionHint")}</p>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("ogImage")}</span>
            <ImageUrlField name="ogImageUrl" defaultValue={page.ogImageUrl} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
            <FormStatus state={state} success={t("saved")} />
          </div>
        </form>
      )}
    </li>
  );
}
