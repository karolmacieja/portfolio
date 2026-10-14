"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { imageUrlSchema } from "@/blocks/schemas";
import { validateSlug, type SlugError } from "@/lib/slug";
import { requireUser } from "@/server/auth/session";
import { themeSchema } from "@/themes/theme";

import { SiteError, type SiteErrorCode } from "./errors";
import { invalidateTags } from "./invalidate";
import * as service from "./service";

/**
 * Server actions for the client panel. Each one authenticates, validates input with Zod and
 * delegates to the owner-scoped service; expected failures come back as typed state.
 */

export type SiteFormState = {
  ok?: boolean;
  /** Key under `sites.errors`. */
  error?: SiteErrorCode | "nameRequired" | "generic";
  /** Key under `sites.slugErrors`. */
  slugError?: SlugError;
  values?: Record<string, string>;
};

const id = z.string().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

async function run(
  fn: () => Promise<{ invalidate: string[] }>,
  values?: Record<string, string>,
): Promise<SiteFormState> {
  try {
    const { invalidate } = await fn();
    invalidateTags(invalidate);
  } catch (error) {
    if (error instanceof SiteError) return { error: error.code, values };
    throw error;
  }
  refresh();
  return { ok: true };
}

function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<
    string,
    string
  >;
}

// --- Sites ---------------------------------------------------------------------------------

const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase(),
});

export async function createSiteAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser("/dashboard");
  const values = { name: String(formData.get("name") ?? ""), slug: String(formData.get("slug") ?? "") };

  const parsed = createSiteSchema.safeParse(values);
  if (!parsed.success) return { error: "nameRequired", values };
  const slugCheck = validateSlug(parsed.data.slug);
  if (!slugCheck.ok) return { error: "slugInvalid", slugError: slugCheck.error, values };

  const t = await getTranslations("sites");
  return run(
    () =>
      service.createSite(user.id, {
        name: parsed.data.name,
        slug: parsed.data.slug,
        locale: user.locale,
        content: service.defaultSiteContent(parsed.data.name, {
          subtitle: t("starterSubtitle"),
          body: t("starterBody"),
        }),
      }),
    values,
  );
}

export async function publishSiteAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser();
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { error: "notFound" };
  return run(() => service.publishSite(user.id, siteId.data));
}

const settingsSchema = z.object({
  siteId: id,
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase(),
  locale: z.enum(["pl", "en"]),
  description: optionalText(300),
  noIndex: z.literal("on").optional(),
  faviconUrl: imageUrlSchema.transform((value) => value || null),
});

export async function updateSiteSettingsAction(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  const user = await requireUser();
  const values = formValues(formData);
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return { error: "nameRequired", values };
  const slugCheck = validateSlug(parsed.data.slug);
  if (!slugCheck.ok) return { error: "slugInvalid", slugError: slugCheck.error, values };

  const { siteId, noIndex, ...input } = parsed.data;
  return run(
    () => service.updateSiteSettings(user.id, siteId, { ...input, noIndex: noIndex === "on" }),
    values,
  );
}

export async function saveThemeAction(siteId: string, theme: unknown): Promise<SiteFormState> {
  // Bound to a site id by the theme page; the theme is validated below.
  const user = await requireUser();
  const parsed = themeSchema.safeParse(theme);
  if (!id.safeParse(siteId).success || !parsed.success) return { error: "generic" };
  return run(() => service.saveThemeDraft(user.id, siteId, parsed.data));
}

// --- Pages ---------------------------------------------------------------------------------

const createPageSchema = z.object({
  siteId: id,
  title: z.string().trim().min(1).max(120),
  path: z.string().max(200),
});

export async function createPageAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser();
  const values = formValues(formData);
  const parsed = createPageSchema.safeParse(values);
  if (!parsed.success) return { error: "path.empty", values };
  const { siteId, ...input } = parsed.data;
  return run(() => service.createPage(user.id, siteId, input), values);
}

const pageMetaSchema = z.object({
  pageId: id,
  title: z.string().trim().min(1).max(120),
  path: z.string().max(200).default(""),
  seoTitle: optionalText(120),
  seoDescription: optionalText(300),
  ogImageUrl: imageUrlSchema.transform((value) => value || null),
});

export async function updatePageMetaAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser();
  const values = formValues(formData);
  const parsed = pageMetaSchema.safeParse(values);
  if (!parsed.success) return { error: "generic", values };
  const { pageId, ...input } = parsed.data;
  return run(() => service.updatePageMeta(user.id, pageId, input), values);
}

export async function deletePageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const pageId = id.parse(formData.get("pageId"));
  await run(() => service.deletePage(user.id, pageId));
}

export async function movePageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const pageId = id.parse(formData.get("pageId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  await run(() => service.movePage(user.id, pageId, direction));
}

export async function restoreVersionAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser();
  const versionId = id.safeParse(formData.get("versionId"));
  if (!versionId.success) return { error: "notFound" };
  return run(() => service.restoreVersion(user.id, versionId.data));
}

// --- Editor --------------------------------------------------------------------------------

export type EditorResult = { ok: true } | { ok: false; error: SiteErrorCode | "generic" };

/**
 * Called by the editor (autosave), bound to a page id. Content is validated strictly by the service;
 * the editor's lock rules argument is ignored for client sites (their locks come from the template).
 */
export async function savePageDraftAction(
  pageId: string,
  content: unknown,
  _lockRules?: unknown,
): Promise<EditorResult> {
  const user = await requireUser();
  if (!id.safeParse(pageId).success) return { ok: false, error: "notFound" };
  try {
    await service.savePageDraft(user.id, pageId, content);
    return { ok: true };
  } catch (error) {
    if (error instanceof SiteError) {
      if (error.code === "invalidContent") console.warn("Rejected page content", pageId, error.details);
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Saves the current draft, then publishes the whole site. */
export async function publishFromEditorAction(pageId: string, content: unknown): Promise<EditorResult> {
  const user = await requireUser();
  const saved = await savePageDraftAction(pageId, content);
  if (!saved.ok) return saved;
  const { site } = await service.getPageForEditing(user.id, pageId);
  try {
    const { invalidate } = await service.publishSite(user.id, site.id);
    invalidateTags(invalidate);
    return { ok: true };
  } catch (error) {
    if (error instanceof SiteError) return { ok: false, error: error.code };
    throw error;
  }
}
