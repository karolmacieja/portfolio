"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { validateSlug } from "@/lib/slug";
import { formValues, type ActionState } from "@/server/action-state";
import { requireUser } from "@/server/auth/session";
import { SiteError } from "@/server/sites/errors";
import { invalidateTags } from "@/server/sites/invalidate";

import * as client from "./client";
import { TemplateError } from "./errors";

/** Client-side template actions (owner-scoped through the template client service). */

const id = z.string().min(1).max(64);

function toState(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof TemplateError) return { error: `templates.errors.${error.code}`, values };
  if (error instanceof SiteError) return { error: `sites.errors.${error.code}`, values };
  throw error;
}

async function run(
  fn: () => Promise<{ invalidate: string[] }>,
  values?: Record<string, string>,
): Promise<ActionState> {
  try {
    invalidateTags((await fn()).invalidate);
  } catch (error) {
    return toState(error, values);
  }
  refresh();
  return { ok: true };
}

export async function createSiteFromTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const values = formValues(formData);
  const parsed = z
    .object({ templateId: id, name: z.string().trim().min(1).max(80), slug: z.string().trim().toLowerCase() })
    .safeParse(values);
  if (!parsed.success) return { error: "sites.errors.nameRequired", values };
  const slug = validateSlug(parsed.data.slug);
  if (!slug.ok) return { error: `sites.slugErrors.${slug.error}`, values };

  let siteId: string;
  try {
    const result = await client.createSiteFromTemplate(user.id, { ...parsed.data, locale: user.locale });
    invalidateTags(result.invalidate);
    siteId = result.value.id;
  } catch (error) {
    return toState(error, values);
  }
  redirect(`/sites/${siteId}`);
}

const siteTemplateSchema = z.object({ siteId: id, templateId: id });

export async function applyTemplateThemeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { siteId, templateId } = siteTemplateSchema.parse(formValues(formData));
  return run(() => client.applyTemplateTheme(user.id, siteId, templateId));
}

export async function switchSiteTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { siteId, templateId } = siteTemplateSchema.parse(formValues(formData));
  return run(() => client.switchSiteTemplate(user.id, siteId, templateId));
}

export async function detachTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => client.detachTemplate(user.id, id.parse(formData.get("siteId"))));
}

export async function restoreBackupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => client.restoreBackup(user.id, id.parse(formData.get("backupId"))));
}
