"use client";

import { Puck, type Data } from "@puckeditor/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { publishFromEditorAction, savePageDraftAction, type EditorResult } from "@/server/sites/actions";
import type { Theme } from "@/themes/theme";

import { createEditorConfig } from "./editor-config";

// no-external: the default stylesheet loads Inter from rsms.me (third-party request).
import "@puckeditor/core/no-external.css";

type Status = "saved" | "unsaved" | "saving" | "error" | "publishing" | "published";

type Props = {
  pageId: string;
  pageTitle: string;
  pagePath: string;
  siteUrl: string;
  backHref: string;
  pages: { id: string; title: string; path: string }[];
  theme: Theme;
  initialData: Data;
  /** Block types above the user's plan: shown locked in the drawer, cannot be inserted. */
  lockedBlocks: string[];
};

const AUTOSAVE_DELAY_MS = 1500;

export function SiteEditor({
  pageId,
  pageTitle,
  pagePath,
  siteUrl,
  backHref,
  pages,
  theme,
  initialData,
  lockedBlocks,
}: Props) {
  const t = useTranslations("editor");
  const tBlocks = useTranslations("blocks");
  const tErrors = useTranslations("sites.errors");
  const messages = useMessages();
  const router = useRouter();

  const config = useMemo(() => createEditorConfig((key) => tBlocks(key as never), theme), [tBlocks, theme]);
  const locked = useMemo(() => new Set(lockedBlocks), [lockedBlocks]);
  const dataRef = useRef<Data>(initialData);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState<string | null>(null);

  const handleResult = useCallback(
    (result: EditorResult, success: Status) => {
      if (result.ok) {
        setStatus(success);
        setError(null);
      } else {
        setStatus("error");
        setError(tErrors(result.error as "generic"));
      }
      return result.ok;
    },
    [tErrors],
  );

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    return handleResult(await savePageDraftAction(pageId, dataRef.current), "saved");
  }, [pageId, handleResult]);

  const publish = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("publishing");
    if (handleResult(await publishFromEditorAction(pageId, dataRef.current), "published")) router.refresh();
  }, [pageId, handleResult, router]);

  const onChange = useCallback(
    (data: Data) => {
      dataRef.current = data;
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (status === "unsaved" || status === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  const statusLabel: Record<Status, string> = {
    saved: t("saved"),
    unsaved: t("unsaved"),
    saving: t("saving"),
    error: t("saveError"),
    publishing: t("publishing"),
    published: t("published"),
  };

  return (
    <Puck
      config={config}
      data={initialData}
      onChange={onChange}
      onPublish={() => void publish()}
      dictionary={messages.puck}
      headerTitle={pageTitle}
      headerPath={`/${pagePath}`}
      height="100dvh"
      viewports={[
        { width: 375, height: "auto", label: t("viewport.mobile"), icon: "Smartphone" },
        { width: 768, height: "auto", label: t("viewport.tablet"), icon: "Tablet" },
        { width: 1280, height: "auto", label: t("viewport.desktop"), icon: "Monitor" },
      ]}
      overrides={{
        // Locked blocks render as a non-draggable item with an upgrade link (the server refuses them anyway).
        drawerItem: ({ children, name }) =>
          locked.has(name) ? (
            <div
              className="mb-2 flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground"
              title={t("locked")}
              data-testid={`locked-block-${name}`}
            >
              <span>
                <span aria-hidden="true">🔒 </span>
                {tBlocks(`names.${name}` as never)}
              </span>
              <a href="/plans" className="text-xs font-medium text-foreground underline">
                {t("lockedCta")}
              </a>
            </div>
          ) : (
            <>{children}</>
          ),
        headerActions: () => (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button asChild variant="ghost" size="sm">
              <a href={backHref}>{t("back")}</a>
            </Button>
            <select
              aria-label={t("page")}
              className="h-8 rounded-md border bg-background px-2"
              value={pageId}
              onChange={async (event) => {
                if (status === "unsaved") await save();
                router.push(`${backHref}/editor/${event.target.value}`);
              }}
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title} (/{page.path})
                </option>
              ))}
            </select>
            <span
              className={status === "error" ? "text-destructive" : "text-muted-foreground"}
              title={error ?? undefined}
              data-testid="editor-status"
            >
              {statusLabel[status]}
              {error ? `: ${error}` : ""}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void save()}>
              {t("save")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void publish()}
              disabled={status === "publishing"}
              data-testid="editor-publish"
            >
              {t("publish")}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={siteUrl} target="_blank" rel="noreferrer">
                {t("preview")}
              </a>
            </Button>
          </div>
        ),
      }}
    />
  );
}
