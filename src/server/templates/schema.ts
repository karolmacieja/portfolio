import { z } from "zod";

import { pageContentSchema, type PageContent } from "@/blocks/content";
import { lockRulesSchema } from "@/blocks/locks";
import { DEFAULT_THEME, themeSchema } from "@/themes/theme";

/** Categories shown as gallery filters (labels in messages `templates.categories.*`). */
export const TEMPLATE_CATEGORIES = ["photography", "design", "development", "architecture", "other"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const templatePageSchema = z.object({
  /** Stable id of the page inside the template (used by the template editor URL). */
  key: z.string().min(1).max(64),
  path: z.string().max(100),
  title: z.string().min(1).max(120),
  content: pageContentSchema,
  lockRules: lockRulesSchema.default({}),
});
export type TemplatePage = z.infer<typeof templatePageSchema>;

/** Template working copy and version payload. The first page is the home page (path ""). */
export const templateDraftSchema = z.object({
  pages: z.array(templatePageSchema).min(1).max(20),
  theme: themeSchema,
});
export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export function emptyTemplateDraft(): TemplateDraft {
  return {
    pages: [
      { key: "home", path: "", title: "Home", content: { root: { props: {} }, content: [] }, lockRules: {} },
    ],
    theme: DEFAULT_THEME,
  };
}

export function parseTemplateDraft(value: unknown): TemplateDraft {
  const parsed = templateDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyTemplateDraft();
}

export function parseTemplatePages(value: unknown): TemplatePage[] {
  const parsed = z.array(templatePageSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type { PageContent };
