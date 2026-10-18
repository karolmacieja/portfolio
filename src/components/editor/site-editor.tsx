"use client";

import { createUsePuck, Puck, type Data } from "@puckeditor/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages, useTranslations } from "next-intl";

import type { LockRule, LockRules } from "@/blocks/locks";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/themes/theme";

import { createEditorConfig } from "./editor-config";

// no-external: the default stylesheet loads Inter from rsms.me (third-party request).
import "@puckeditor/core/no-external.css";

type Status = "saved" | "unsaved" | "saving" | "error" | "publishing" | "published";

export type EditorResult = { ok: true } | { ok: false; error: string; details?: unknown };
export type EditorAction = (data: Data, lockRules: LockRules) => Promise<EditorResult>;

type Props = {
  /** "site": a client's page (template locks are enforced); "template": admin authoring (locks are editable). */
  mode: "site" | "template";
  pageKey: string;
  pageTitle: string;
  pagePath: string;
  previewUrl: string;
  backHref: string;
  pages: { key: string; title: string; path: string; href: string }[];
  theme: Theme;
  initialData: Data;
  initialLockRules: LockRules;
  /** Block types above the user's plan: shown locked in the drawer, cannot be inserted. */
  lockedBlocks: string[];
  save: EditorAction;
  publish: EditorAction;
  /** Message namespace for error codes returned by the actions. */
  errorNamespace: "sites.errors" | "templates.errors";
};

const AUTOSAVE_DELAY_MS = 1500;
const usePuck = createUsePuck();

function LockPanel({
  rules,
  onChange,
}: {
  rules: LockRules;
  onChange: (id: string, rule: LockRule) => void;
}) {
  const t = useTranslations("adminTemplates");
  const selected = usePuck((state) => state.selectedItem);
  const id = selected?.props?.id as string | undefined;
  const rule = (id && rules[id]) || {};
  const toggle = (key: keyof LockRule, locked: boolean) => {
    if (!id) return;
    const next: LockRule = { ...rule };
    if (locked) next[key] = false;
    else delete next[key];
    onChange(id, next);
  };

  return (
    <div className="grid gap-2 border-b p-4 text-sm" data-testid="lock-panel">
      <span className="font-medium">{t("lockPanel")}</span>
      {id ? (
        (["edit", "drag", "delete"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule[key] === false}
              onChange={(event) => toggle(key, event.target.checked)}
            />
            {t(key === "edit" ? "lockEdit" : key === "drag" ? "lockDrag" : "lockDelete")}
          </label>
        ))
      ) : (
        <span className="text-muted-foreground">{t("lockHint")}</span>
      )}
    </div>
  );
}

/** Puck editor shared by client sites and admin templates (autosave, publish, page switcher, locks). */
export function PageEditor({
  mode,
  pageKey,
  pageTitle,
  pagePath,
  previewUrl,
  backHref,
  pages,
  theme,
  initialData,
  initialLockRules,
  lockedBlocks,
  save: saveAction,
  publish: publishAction,
  errorNamespace,
}: Props) {
  const t = useTranslations("editor");
  const tBlocks = useTranslations("blocks");
  const tContact = useTranslations("site.contact");
  const tSite = useTranslations("site");
  const tErrors = useTranslations(errorNamespace);
  const messages = useMessages();
  const router = useRouter();

  const [lockRules, setLockRules] = useState<LockRules>(initialLockRules);
  const lockRulesRef = useRef(lockRules);
  // In site mode the template's locks restrict the editor; in template mode they are being authored.
  const config = useMemo(
    () =>
      createEditorConfig(
        (key) => tBlocks(key as never),
        theme,
        mode === "site" ? initialLockRules : {},
        t("emptyHint"),
      ),
    [tBlocks, t, theme, mode, initialLockRules],
  );
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
        // Only "tierTooLow" uses a value ({tier}); other messages ignore it.
        setError(
          (tErrors as (key: string, values?: Record<string, string>) => string)(result.error, {
            tier: String(result.details ?? ""),
          }),
        );
      }
      return result.ok;
    },
    [tErrors],
  );

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    return handleResult(await saveAction(dataRef.current, lockRulesRef.current), "saved");
  }, [saveAction, handleResult]);

  const publish = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("publishing");
    if (handleResult(await publishAction(dataRef.current, lockRulesRef.current), "published"))
      router.refresh();
  }, [publishAction, handleResult, router]);

  const scheduleSave = useCallback(() => {
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  const onChange = useCallback(
    (data: Data) => {
      dataRef.current = data;
      scheduleSave();
    },
    [scheduleSave],
  );

  const onLockChange = useCallback(
    (id: string, rule: LockRule) => {
      setLockRules((current) => {
        const next = { ...current, [id]: rule };
        if (Object.keys(rule).length === 0) delete next[id];
        lockRulesRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
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
      metadata={{
        contact: {
          name: tContact("name"),
          email: tContact("email"),
          message: tContact("message"),
          submit: tContact("submit"),
          sent: tContact("sent"),
          error: tContact("error"),
          honeypot: tContact("honeypot"),
        },
        download: tSite("download"),
      }}
      headerTitle={pageTitle}
      headerPath={`/${pagePath}`}
      height="100dvh"
      viewports={[
        { width: 375, height: "auto", label: t("viewport.mobile"), icon: "Smartphone" },
        { width: 768, height: "auto", label: t("viewport.tablet"), icon: "Tablet" },
        { width: 1280, height: "auto", label: t("viewport.desktop"), icon: "Monitor" },
      ]}
      overrides={{
        fields: ({ children }) => (
          <>
            {mode === "template" && <LockPanel rules={lockRules} onChange={onLockChange} />}
            {children}
          </>
        ),
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
              value={pageKey}
              onChange={async (event) => {
                if (status === "unsaved") await save();
                const target = pages.find((p) => p.key === event.target.value);
                if (target) router.push(target.href);
              }}
            >
              {pages.map((page) => (
                <option key={page.key} value={page.key}>
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
              <a href={previewUrl} target="_blank" rel="noreferrer">
                {t("preview")}
              </a>
            </Button>
          </div>
        ),
      }}
    />
  );
}
