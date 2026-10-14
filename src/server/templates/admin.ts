import "server-only";

import { randomBytes } from "node:crypto";

import { validatePageContent } from "@/blocks/content";
import { normalizeLockRules, type LockRules } from "@/blocks/locks";
import { Prisma, TemplateStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizePagePath, validatePagePath } from "@/lib/page-path";
import {
  accessTierSchema,
  ENTITLED_STATUSES,
  getBlockTiers,
  requiredTierForContent,
  tierCovers,
} from "@/server/entitlements";
import { themeSchema, type Theme } from "@/themes/theme";

import { templateTag } from "./cache";
import { TemplateError } from "./errors";
import { emptyTemplateDraft, parseTemplateDraft, TEMPLATE_CATEGORIES, type TemplateDraft } from "./schema";

/**
 * Template authoring for ADMIN users (callers must check the role). Not owner-scoped by design:
 * templates are platform content. Mutations return cache tags to invalidate.
 */

type Result<T> = { value: T; invalidate: string[] };

const toJson = (value: unknown) => value as Prisma.InputJsonObject;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function load(templateId: string) {
  const template = await db.template.findUnique({ where: { id: templateId } });
  if (!template) throw new TemplateError("notFound");
  return { template, draft: parseTemplateDraft(template.draft) };
}

async function saveDraft(templateId: string, draft: TemplateDraft) {
  await db.template.update({ where: { id: templateId }, data: { draft: toJson(draft) } });
}

export async function listTemplatesWithStats() {
  const templates = await db.template.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      publishedVersion: { select: { number: true } },
      sites: { select: { ownerId: true } },
    },
  });
  const owners = [...new Set(templates.flatMap((t) => t.sites.map((s) => s.ownerId)))];
  const paying = new Set(
    (
      await db.subscription.findMany({
        where: { userId: { in: owners }, status: { in: [...ENTITLED_STATUSES] } },
        select: { userId: true },
      })
    ).map((s) => s.userId),
  );
  return templates.map(({ sites, draft: _draft, ...template }) => {
    const users = new Set(sites.map((s) => s.ownerId));
    const converted = [...users].filter((id) => paying.has(id)).length;
    return {
      ...template,
      uses: sites.length,
      /** Share of users who used the template and have a paid/trial plan now (0-1), null without users. */
      conversion: users.size > 0 ? converted / users.size : null,
    };
  });
}

export async function getTemplateForAdmin(templateId: string) {
  const template = await db.template.findUnique({
    where: { id: templateId },
    include: {
      versions: { orderBy: { number: "desc" }, select: { id: true, number: true, createdAt: true } },
      overrides: { include: { plan: { select: { name: true } }, user: { select: { email: true } } } },
    },
  });
  if (!template) throw new TemplateError("notFound");
  return { ...template, draftData: parseTemplateDraft(template.draft) };
}

export async function createTemplate(input: {
  name: string;
  slug: string;
  category: string;
}): Promise<Result<{ id: string }>> {
  if (!SLUG_PATTERN.test(input.slug) || input.slug.length > 60) throw new TemplateError("slugInvalid");
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(input.category)
    ? input.category
    : "other";
  const last = await db.template.aggregate({ _max: { position: true } });
  try {
    const template = await db.template.create({
      data: {
        name: input.name,
        slug: input.slug,
        category,
        position: (last._max.position ?? 0) + 1,
        draft: toJson(emptyTemplateDraft()),
      },
    });
    return { value: { id: template.id }, invalidate: [] };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TemplateError("slugTaken");
    }
    throw error;
  }
}

export type TemplateMetaInput = {
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

export async function updateTemplateMeta(
  templateId: string,
  input: TemplateMetaInput,
): Promise<Result<void>> {
  const { template } = await load(templateId);
  if (!SLUG_PATTERN.test(input.slug) || input.slug.length > 60) throw new TemplateError("slugInvalid");
  const tier = accessTierSchema.parse(input.accessTier);
  try {
    await db.template.update({
      where: { id: template.id },
      data: {
        ...input,
        accessTier: tier,
        category: (TEMPLATE_CATEGORIES as readonly string[]).includes(input.category)
          ? input.category
          : "other",
        priceAmount: input.isPremium ? input.priceAmount : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TemplateError("slugTaken");
    }
    throw error;
  }
  return { value: undefined, invalidate: [templateTag(template.slug), templateTag(input.slug)] };
}

export async function saveTemplatePage(
  templateId: string,
  key: string,
  content: unknown,
  lockRules: LockRules,
): Promise<Result<void>> {
  const { template, draft } = await load(templateId);
  const page = draft.pages.find((p) => p.key === key);
  if (!page) throw new TemplateError("notFound");
  const validation = validatePageContent(content);
  if (!validation.ok) throw new TemplateError("invalidContent", validation.issues);
  page.content = validation.content as never;
  page.lockRules = normalizeLockRules(lockRules, validation.content);
  await saveDraft(template.id, draft);
  return { value: undefined, invalidate: [] };
}

export async function addTemplatePage(
  templateId: string,
  input: { title: string; path: string },
): Promise<Result<{ key: string }>> {
  const { template, draft } = await load(templateId);
  const path = normalizePagePath(input.path);
  const check = validatePagePath(path);
  if (!check.ok) throw new TemplateError(`path.${check.error}`);
  if (draft.pages.some((p) => p.path === path)) throw new TemplateError("pathTaken");
  const key = randomBytes(6).toString("base64url");
  draft.pages.push({
    key,
    path,
    title: input.title,
    content: { root: { props: {} }, content: [] },
    lockRules: {},
  });
  await saveDraft(template.id, draft);
  return { value: { key }, invalidate: [] };
}

export async function removeTemplatePage(templateId: string, key: string): Promise<Result<void>> {
  const { template, draft } = await load(templateId);
  const page = draft.pages.find((p) => p.key === key);
  if (!page) throw new TemplateError("notFound");
  if (page.path === "") throw new TemplateError("cannotDeleteHome");
  draft.pages = draft.pages.filter((p) => p.key !== key);
  await saveDraft(template.id, draft);
  return { value: undefined, invalidate: [] };
}

export async function saveTemplateTheme(templateId: string, theme: Theme): Promise<Result<void>> {
  const { template, draft } = await load(templateId);
  draft.theme = themeSchema.parse(theme);
  await saveDraft(template.id, draft);
  return { value: undefined, invalidate: [] };
}

/**
 * Snapshots the draft into a new version and makes it the published one. Refuses when the content
 * uses blocks above the template's tier (clients on that tier couldn't keep editing them).
 */
export async function publishTemplate(
  templateId: string,
  actorId: string,
): Promise<Result<{ versionId: string }>> {
  const { template, draft } = await load(templateId);
  for (const page of draft.pages) {
    const validation = validatePageContent(page.content);
    if (!validation.ok) throw new TemplateError("invalidContent", validation.issues);
  }
  const required = requiredTierForContent(
    draft.pages.map((p) => p.content),
    await getBlockTiers(),
  );
  if (!tierCovers(template.accessTier, required)) throw new TemplateError("tierTooLow", required);

  const version = await db.$transaction(async (tx) => {
    const last = await tx.templateVersion.aggregate({ where: { templateId }, _max: { number: true } });
    const created = await tx.templateVersion.create({
      data: {
        templateId,
        number: (last._max.number ?? 0) + 1,
        pages: toJson(draft.pages),
        theme: toJson(draft.theme),
        createdById: actorId,
      },
    });
    await tx.template.update({
      where: { id: templateId },
      data: { publishedVersionId: created.id, status: TemplateStatus.PUBLISHED },
    });
    return created;
  });
  return { value: { versionId: version.id }, invalidate: [templateTag(template.slug)] };
}

export async function setTemplateStatus(templateId: string, status: TemplateStatus): Promise<Result<void>> {
  const { template } = await load(templateId);
  if (status === TemplateStatus.PUBLISHED && !template.publishedVersionId)
    throw new TemplateError("noPublishedVersion");
  await db.template.update({ where: { id: template.id }, data: { status } });
  return { value: undefined, invalidate: [templateTag(template.slug)] };
}

export async function addTemplateOverride(
  templateId: string,
  input: { planId?: string; userEmail?: string },
): Promise<Result<void>> {
  const { template } = await load(templateId);
  let userId: string | undefined;
  if (input.userEmail) {
    const user = await db.user.findUnique({ where: { email: input.userEmail.trim().toLowerCase() } });
    if (!user) throw new TemplateError("userNotFound");
    userId = user.id;
  }
  if (!userId && !input.planId) throw new TemplateError("notFound");
  await db.templateOverride.create({
    data: { templateId: template.id, userId, planId: userId ? null : input.planId },
  });
  return { value: undefined, invalidate: [] };
}

export async function removeTemplateOverride(overrideId: string): Promise<Result<void>> {
  await db.templateOverride.delete({ where: { id: overrideId } });
  return { value: undefined, invalidate: [] };
}
