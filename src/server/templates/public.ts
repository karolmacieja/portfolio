import "server-only";

import { unstable_cache } from "next/cache";

import { TemplateStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { templateTag } from "./cache";

/** Published template version for the public preview (cached, invalidated on publish/status change). */
export function getTemplatePreview(slug: string) {
  return unstable_cache(
    async () => {
      const template = await db.template.findUnique({
        where: { slug },
        include: { publishedVersion: { select: { pages: true, theme: true } } },
      });
      if (!template || template.status !== TemplateStatus.PUBLISHED || !template.publishedVersion)
        return null;
      return {
        name: template.name,
        pages: template.publishedVersion.pages,
        theme: template.publishedVersion.theme,
      };
    },
    ["template-preview", slug],
    { tags: [templateTag(slug)], revalidate: 86400 },
  )();
}
