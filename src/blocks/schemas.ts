import { z } from "zod";

import { blockAppearanceSchema, colorValueSchema } from "./appearance";

/**
 * Block prop schemas: the single source of truth for block data. Enforced when saving drafts
 * (strict) and before rendering (lenient: invalid blocks are dropped). Text is always plain text
 * rendered as React text nodes - clients can never inject HTML or scripts.
 */

const text = (max: number) => z.string().max(max);

/** Links: http(s), mailto:, tel:, site-relative paths and in-page anchors. Never javascript: etc. */
export const hrefSchema = z
  .string()
  .max(2048)
  .refine((value) => value === "" || /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value), "invalidHref");

/** Images come from our storage (absolute http(s) URL or the local `/storage/` route). */
export const imageUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => value === "" || /^(https?:\/\/|\/storage\/)/i.test(value), "invalidImageUrl");

export const imageSchema = z.object({
  url: imageUrlSchema,
  alt: text(300),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});
export type ImageValue = z.infer<typeof imageSchema>;
export const EMPTY_IMAGE: ImageValue = { url: "", alt: "" };

const align = z.enum(["left", "center"]);
const align3 = z.enum(["left", "center", "right"]);

/** Documents (PDF) from our storage, offered for download. */
export const fileSchema = z.object({
  url: imageUrlSchema,
  name: text(200),
  sizeBytes: z.number().int().nonnegative().max(1_000_000_000).optional(),
});
export type FileValue = z.infer<typeof fileSchema>;
export const EMPTY_FILE: FileValue = { url: "", name: "" };

/** Icons of the IconList block (rendered from a fixed set, see render/icons.tsx). */
export const ICON_NAMES = [
  "check",
  "star",
  "heart",
  "zap",
  "camera",
  "pen",
  "code",
  "palette",
  "globe",
  "mail",
  "phone",
  "pin",
  "clock",
  "award",
  "users",
  "briefcase",
  "rocket",
  "shield",
  "target",
  "sparkles",
] as const;

export const SOCIAL_PLATFORMS = [
  "instagram",
  "linkedin",
  "behance",
  "dribbble",
  "github",
  "x",
  "facebook",
  "youtube",
  "vimeo",
  "tiktok",
  "email",
  "website",
] as const;

/** Slot props hold nested blocks (validated recursively by content.ts). */
const slot = z.array(z.unknown()).max(100);

/** Every block also carries the shared, optional `appearance` (colours, spacing, width, visibility). */
const blockSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, appearance: blockAppearanceSchema.optional() });

export const blockPropSchemas = {
  Hero: blockSchema({
    title: text(200),
    subtitle: text(1000),
    align,
    image: imageSchema,
    buttonLabel: text(80),
    buttonHref: hrefSchema,
  }),
  Text: blockSchema({ heading: text(200), text: text(20_000), align }),
  Image: blockSchema({ image: imageSchema, caption: text(300), width: z.enum(["normal", "wide", "full"]) }),
  Gallery: blockSchema({
    heading: text(200),
    layout: z.enum(["grid", "masonry", "carousel"]),
    columns: z.enum(["2", "3", "4"]),
    images: z.array(z.object({ image: imageSchema, caption: text(300) })).max(60),
  }),
  Project: blockSchema({
    title: text(200),
    subtitle: text(200),
    description: text(10_000),
    images: z.array(z.object({ image: imageSchema })).max(30),
    linkLabel: text(80),
    linkHref: hrefSchema,
  }),
  ProjectList: blockSchema({
    heading: text(200),
    columns: z.enum(["2", "3"]),
    items: z
      .array(z.object({ title: text(200), description: text(1000), image: imageSchema, href: hrefSchema }))
      .max(60),
  }),
  About: blockSchema({
    heading: text(200),
    text: text(10_000),
    image: imageSchema,
    imagePosition: z.enum(["left", "right"]),
  }),
  Timeline: blockSchema({
    heading: text(200),
    items: z
      .array(
        z.object({ period: text(60), title: text(200), organization: text(200), description: text(2000) }),
      )
      .max(50),
  }),
  Skills: blockSchema({
    heading: text(200),
    style: z.enum(["tags", "bars"]),
    items: z.array(z.object({ name: text(80), level: z.number().int().min(0).max(100) })).max(60),
  }),
  Testimonials: blockSchema({
    heading: text(200),
    items: z.array(z.object({ quote: text(2000), author: text(120), role: text(120) })).max(30),
  }),
  ContactForm: blockSchema({ heading: text(200), description: text(1000), submitLabel: text(60) }),
  SocialLinks: blockSchema({
    heading: text(200),
    align,
    items: z.array(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: hrefSchema })).max(20),
  }),
  Video: blockSchema({ url: z.string().max(500), caption: text(300) }),
  Spacer: blockSchema({ size: z.enum(["sm", "md", "lg"]) }),
  Heading: blockSchema({
    text: text(200),
    subtitle: text(500),
    level: z.enum(["h1", "h2", "h3", "h4"]),
    size: z.enum(["sm", "md", "lg", "xl"]),
    align: align3,
  }),
  Buttons: blockSchema({
    align: align3,
    items: z
      .array(z.object({ label: text(80), href: hrefSchema, variant: z.enum(["primary", "secondary"]) }))
      .max(4),
  }),
  Quote: blockSchema({ quote: text(2000), author: text(120), role: text(120), align, image: imageSchema }),
  Divider: blockSchema({ variant: z.enum(["line", "dots", "wave"]), width: z.enum(["short", "full"]) }),
  IconList: blockSchema({
    heading: text(200),
    columns: z.enum(["1", "2", "3"]),
    items: z.array(z.object({ icon: z.enum(ICON_NAMES), title: text(120), text: text(1000) })).max(30),
  }),
  Section: blockSchema({
    image: imageSchema,
    overlay: z.enum(["none", "light", "dark"]),
    gradient: z.enum(["none", "vertical", "horizontal", "diagonal"]),
    gradientFrom: colorValueSchema,
    gradientTo: colorValueSchema,
    minHeight: z.enum(["auto", "half", "screen"]),
    verticalAlign: z.enum(["top", "center", "bottom"]),
    content: slot,
  }),
  Pricing: blockSchema({
    heading: text(200),
    description: text(1000),
    items: z
      .array(
        z.object({
          name: text(120),
          price: text(40),
          period: text(40),
          description: text(500),
          features: text(3000),
          buttonLabel: text(80),
          buttonHref: hrefSchema,
          featured: z.boolean(),
        }),
      )
      .max(6),
  }),
  Faq: blockSchema({
    heading: text(200),
    items: z.array(z.object({ question: text(300), answer: text(5000) })).max(50),
  }),
  Stats: blockSchema({
    heading: text(200),
    items: z.array(z.object({ value: text(30), label: text(120) })).max(8),
  }),
  Logos: blockSchema({
    heading: text(200),
    grayscale: z.boolean(),
    items: z.array(z.object({ image: imageSchema, href: hrefSchema })).max(40),
  }),
  FileDownload: blockSchema({
    heading: text(200),
    description: text(1000),
    file: fileSchema,
    buttonLabel: text(80),
  }),
  Columns: blockSchema({
    layout: z.enum(["1-1", "1-2", "2-1", "1-1-1"]),
    gap: z.enum(["sm", "md", "lg"]),
    col1: slot,
    col2: slot,
    col3: slot,
  }),
};

export type BlockType = keyof typeof blockPropSchemas;
export type BlockProps = { [K in BlockType]: z.infer<(typeof blockPropSchemas)[K]> };
export const BLOCK_TYPES = Object.keys(blockPropSchemas) as BlockType[];

/** Props that contain nested blocks (Puck slot fields). */
export const SLOT_PROPS: Partial<Record<BlockType, readonly string[]>> = {
  Columns: ["col1", "col2", "col3"],
  Section: ["content"],
};

export function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(blockPropSchemas, type);
}
