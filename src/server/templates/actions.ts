"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { lockRulesSchema } from "@/blocks/locks";
import { imageUrlSchema } from "@/blocks/schemas";
import { TemplateStatus } from "@/generated/prisma/enums";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { enqueueThumbnail } from "@/server/jobs/queues";
import { invalidateTags } from "@/server/sites/invalidate";
import { themeSchema } from "@/themes/theme";

import * as admin from "./admin";
import { TemplateError } from "./errors";

/** Template authoring actions: staff with templates.manage. Changes are audited (not autosaves). */

const staff = () => requirePermission("templates.manage");

/** Records the action when it succeeded and passes the result through. */
async function audited(
  result: ActionState,
  actor: { id: string },
  action: string,
  templateId: string,
  metadata?: Record<string, unknown>,
) {
  if (result.ok) await audit(actor, action, { type: "Template", id: templateId }, metadata);
  return result;
}
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
  const actor = await staff();
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
  await audit(actor, "template.create", { type: "Template", id: templateId }, { slug: parsed.data.slug });
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
  const actor = await staff();
  const values = formValues(formData);
  const parsed = metaSchema.safeParse(values);
  if (!parsed.success) return { error: "templates.errors.slugInvalid", values };
  const { templateId, isNew, isFeatured, isPremium, price, ...meta } = parsed.data;
  const zloty = Number((price ?? "").replace(",", "."));
  const data = {
    ...meta,
    isNew: isNew === "on",
    isFeatured: isFeatured === "on",
    isPremium: isPremium === "on",
    priceAmount: Number.isFinite(zloty) && zloty > 0 ? Math.round(zloty * 100) : null,
  };
  return audited(
    await run(() => admin.updateTemplateMeta(templateId, data), values),
    actor,
    "template.update",
    templateId,
    {
      accessTier: data.accessTier,
      isPremium: data.isPremium,
      priceAmount: data.priceAmount,
    },
  );
}

export async function addTemplatePageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await staff();
  const values = formValues(formData);
  const parsed = z
    .object({ templateId: id, title: z.string().trim().min(1).max(120), path: z.string().max(200) })
    .safeParse(values);
  if (!parsed.success) return { error: "templates.errors.path.empty", values };
  const { templateId, ...page } = parsed.data;
  return run(() => admin.addTemplatePage(templateId, page), values);
}

export async function removeTemplatePageAction(formData: FormData): Promise<void> {
  await staff();
  await run(() =>
    admin.removeTemplatePage(id.parse(formData.get("templateId")), id.parse(formData.get("key"))),
  );
}

export async function saveTemplateThemeAction(templateId: string, theme: unknown): Promise<ActionState> {
  await staff();
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
  await staff();
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
  const user = await staff();
  const saved = await saveTemplatePageAction(templateId, key, content, lockRules);
  if (!saved.ok) return saved;
  try {
    invalidateTags((await publish(templateId, user.id)).invalidate);
    await audit(user, "template.publish", { type: "Template", id: templateId });
    return { ok: true };
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, error: error.code, details: error.details };
    throw error;
  }
}

export async function publishTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await staff();
  const templateId = id.parse(formData.get("templateId"));
  return audited(await run(() => publish(templateId, user.id)), user, "template.publish", templateId);
}

export async function setTemplateStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await staff();
  const status = z.enum([TemplateStatus.PUBLISHED, TemplateStatus.ARCHIVED]).parse(formData.get("status"));
  const templateId = id.parse(formData.get("templateId"));
  return audited(
    await run(() => admin.setTemplateStatus(templateId, status)),
    actor,
    "template.status",
    templateId,
    {
      status,
    },
  );
}

export async function addTemplateOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await staff();
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
  const result = await run(
    () =>
      admin.addTemplateOverride(templateId, {
        planId: planId || undefined,
        userEmail: userEmail || undefined,
      }),
    values,
  );
  return audited(result, actor, "template.override.add", templateId, { planId, userEmail });
}

export async function removeTemplateOverrideAction(formData: FormData): Promise<void> {
  const actor = await staff();
  const overrideId = id.parse(formData.get("overrideId"));
  const result = await run(() => admin.removeTemplateOverride(overrideId));
  if (result.ok) await audit(actor, "template.override.remove", { type: "TemplateOverride", id: overrideId });
}
