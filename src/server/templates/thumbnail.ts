import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { processImage } from "@/server/media/image";
import { createStorage } from "@/server/storage";
import { createThumbnailRenderer } from "@/server/thumbnails";

/**
 * Renders and stores a thumbnail for a template version (run by the worker). Uses the public
 * preview page, so it must run after the version is published.
 */
export async function renderTemplateThumbnail(templateId: string, versionId: string): Promise<string> {
  const env = getEnv();
  const template = await db.template.findUniqueOrThrow({ where: { id: templateId } });
  const version = await db.templateVersion.findUniqueOrThrow({ where: { id: versionId } });

  const png = await createThumbnailRenderer(env).render({
    url: platformUrl("app", `/template-preview/${template.slug}`),
    title: template.name,
  });
  const image = await processImage(png);
  const storage = createStorage(env);
  const key = `templates/${template.id}/v${version.number}.webp`;
  await storage.put(key, image.main.buffer, image.contentType);

  const url = storage.publicUrl(key);
  await db.template.update({ where: { id: template.id }, data: { thumbnailUrl: url } });
  return url;
}
