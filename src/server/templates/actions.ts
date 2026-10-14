"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { lockRulesSchema } from "@/blocks/locks";
import { imageUrlSchema } from "@/blocks/schemas";
import { Role, TemplateStatus } from "@/generated/prisma/enums";
import { formValues, type ActionState } from "@/server/action-state";
import { requireRole } from "@/server/auth/session";
import { enqueueThumbnail } from "@/server/jobs/queues";
import { invalidateTags } from "@/server/sites/invalidate";
import { themeSchema } from "@/themes/theme";

import * as admin from "./admin";
import { TemplateError } from "./errors";

/** Template authoring actions: ADMIN only. */

const ADMIN_ONLY = [Role.ADMIN] as const;
const id = z.string().min(1).max(64);

async function run(
  fn: () => Promise<{ invalidate: string[] }>,
  values?: Record<string, string>,
): Promise<ActionState> {
  try {
    const { invalidate } = await fn();
    invalidateTags(invalidate);
  } catch (error) {
    if (error instanceof TemplateError) {
      return {
        error: `templates.errors.${error.code}`,
        errorValues: typeof error.details === "string" ? { tier: error.details } : undefined,
        values,
      };
    }
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function createTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      slug: z.string().trim().toLowerCase(),
      category: z.string(),
    })
    .safeParse(values);
  if (!parsed.success) return { error: "templates.errors.slugInvalid", values };
  let templateId: string;
  try {
    templateId = (await admin.createTemplate(parsed.data)).value.id;
  } catch (error) {
    if (error instanceof TemplateError) return { error: `templates.errors.${error.code}`, values };
    throw error;
  }
  redirect(`/templates/${templateId}`);
}

const metaSchema = z.object({
  templateId: id,
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase(),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  category: z.string().max(40),
  tags: z
    .string()
    .max(300)
    .transform((v) =>
      v
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
    ),
  accessTier: z.string(),
  position: z.coerce.number().int().min(0).max(10_000),
  isNew: z.literal("on").optional(),
  isFeatured: z.literal("on").optional(),
  isPremium: z.literal("on").optional(),
  price: z.string().optional(),
  thumbnailUrl: imageUrlSchema.transform((v) => v || null),
});

export async function updateTemplateMetaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = metaSchema.safeParse(values);
  if (!parsed.success) return { error: "templates.errors.slugInvalid", values };
  const { templateId, isNew, isFeatured, isPremium, price, ...meta } = parsed.data;
  const zloty = Number((price ?? "").replace(",", "."));
  return run(
    () =>
      admin.updateTemplateMeta(templateId, {
        ...meta,
        isNew: isNew === "on",
        isFeatured: isFeatured === "on",
        isPremium: isPremium === "on",
        priceAmount: Number.isFinite(zloty) && zloty > 0 ? Math.round(zloty * 100) : null,
      }),
    values,
  );
}

export async function addTemplatePageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = z
    .object({ templateId: id, title: z.string().trim().min(1).max(120), path: z.string().max(200) })
    .safeParse(values);
  if (!parsed.success) return { error: "templates.errors.path.empty", values };
  const { templateId, ...page } = parsed.data;
  return run(() => admin.addTemplatePage(templateId, page), values);
}

export async function removeTemplatePageAction(formData: FormData): Promise<void> {
  await requireRole(ADMIN_ONLY);
  await run(() =>
    admin.removeTemplatePage(id.parse(formData.get("templateId")), id.parse(formData.get("key"))),
  );
}

export async function saveTemplateThemeAction(templateId: string, theme: unknown): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return { error: "templates.errors.invalidContent" };
  return run(() => admin.saveTemplateTheme(templateId, parsed.data));
}

type EditorResult = { ok: true } | { ok: false; error: string; details?: unknown };

/** Editor autosave for a template page (bound to template id and page key). */
export async function saveTemplatePageAction(
  templateId: string,
  key: string,
  content: unknown,
  lockRules: unknown,
): Promise<EditorResult> {
  await requireRole(ADMIN_ONLY);
  const rules = lockRulesSchema.safeParse(lockRules ?? {});
  try {
    await admin.saveTemplatePage(templateId, key, content, rules.success ? rules.data : {});
    return { ok: true };
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, error: error.code, details: error.details };
    throw error;
  }
}

async function publish(templateId: string, actorId: string): Promise<{ invalidate: string[] }> {
  const result = await admin.publishTemplate(templateId, actorId);
  await enqueueThumbnail({ templateId, versionId: result.value.versionId });
  return result;
}

/** Editor "Publish": saves the current page, then publishes a new template version. */
export async function publishTemplateFromEditorAction(
  templateId: string,
  key: string,
  content: unknown,
  lockRules: unknown,
): Promise<EditorResult> {
  const user = await requireRole(ADMIN_ONLY);
  const saved = await saveTemplatePageAction(templateId, key, content, lockRules);
  if (!saved.ok) return saved;
  try {
    invalidateTags((await publish(templateId, user.id)).invalidate);
    return { ok: true };
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, error: error.code, details: error.details };
    throw error;
  }
}

export async function publishTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(ADMIN_ONLY);
  return run(() => publish(id.parse(formData.get("templateId")), user.id));
}

export async function setTemplateStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const status = z.enum([TemplateStatus.PUBLISHED, TemplateStatus.ARCHIVED]).parse(formData.get("status"));
  return run(() => admin.setTemplateStatus(id.parse(formData.get("templateId")), status));
}

export async function addTemplateOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = z
    .object({
      templateId: id,
      planId: z.string().max(64).optional(),
      userEmail: z.string().max(254).optional(),
    })
    .safeParse(values);
  if (!parsed.success) return { error: "templates.errors.notFound", values };
  const { templateId, planId, userEmail } = parsed.data;
  return run(
    () =>
      admin.addTemplateOverride(templateId, {
        planId: planId || undefined,
        userEmail: userEmail || undefined,
      }),
    values,
  );
}

export async function removeTemplateOverrideAction(formData: FormData): Promise<void> {
  await requireRole(ADMIN_ONLY);
  await run(() => admin.removeTemplateOverride(id.parse(formData.get("overrideId"))));
}
