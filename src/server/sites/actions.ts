"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { validateSlug, type SlugError } from "@/lib/slug";
import { requireUser } from "@/server/auth/session";

import { SiteError, type SiteErrorCode } from "./errors";
import { invalidateTags } from "./invalidate";
import { createSite, defaultSiteContent, publishSite } from "./service";

export type SiteFormState = {
  ok?: boolean;
  /** Key under `sites.errors`. */
  error?: SiteErrorCode | "nameRequired" | "generic";
  /** Key under `sites.slugErrors`. */
  slugError?: SlugError;
  values?: { name: string; slug: string };
};

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
  try {
    const { invalidate } = await createSite(user.id, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      locale: user.locale,
      content: defaultSiteContent(parsed.data.name, {
        subtitle: t("starterSubtitle"),
        body: t("starterBody"),
      }),
    });
    invalidateTags(invalidate);
  } catch (error) {
    if (error instanceof SiteError) return { error: error.code, values };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function publishSiteAction(_prev: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const user = await requireUser("/dashboard");
  const siteId = z.string().min(1).max(64).safeParse(formData.get("siteId"));
  if (!siteId.success) return { error: "notFound" };

  try {
    const { invalidate } = await publishSite(user.id, siteId.data);
    invalidateTags(invalidate);
  } catch (error) {
    if (error instanceof SiteError) return { error: error.code };
    throw error;
  }
  refresh();
  return { ok: true };
}
