import { z } from "zod";

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

export const blockPropSchemas = {
  Hero: z.object({
    title: text(200),
    subtitle: text(1000),
    align,
    image: imageSchema,
    buttonLabel: text(80),
    buttonHref: hrefSchema,
  }),
  Text: z.object({ heading: text(200), text: text(20_000), align }),
  Image: z.object({ image: imageSchema, caption: text(300), width: z.enum(["normal", "wide", "full"]) }),
  Gallery: z.object({
    heading: text(200),
    layout: z.enum(["grid", "masonry", "carousel"]),
    columns: z.enum(["2", "3", "4"]),
    images: z.array(z.object({ image: imageSchema, caption: text(300) })).max(60),
  }),
  Project: z.object({
    title: text(200),
    subtitle: text(200),
    description: text(10_000),
    images: z.array(z.object({ image: imageSchema })).max(30),
    linkLabel: text(80),
    linkHref: hrefSchema,
  }),
  ProjectList: z.object({
    heading: text(200),
    columns: z.enum(["2", "3"]),
    items: z
      .array(z.object({ title: text(200), description: text(1000), image: imageSchema, href: hrefSchema }))
      .max(60),
  }),
  About: z.object({
    heading: text(200),
    text: text(10_000),
    image: imageSchema,
    imagePosition: z.enum(["left", "right"]),
  }),
  Timeline: z.object({
    heading: text(200),
    items: z
      .array(
        z.object({ period: text(60), title: text(200), organization: text(200), description: text(2000) }),
      )
      .max(50),
  }),
  Skills: z.object({
    heading: text(200),
    style: z.enum(["tags", "bars"]),
    items: z.array(z.object({ name: text(80), level: z.number().int().min(0).max(100) })).max(60),
  }),
  Testimonials: z.object({
    heading: text(200),
    items: z.array(z.object({ quote: text(2000), author: text(120), role: text(120) })).max(30),
  }),
  ContactForm: z.object({ heading: text(200), description: text(1000), submitLabel: text(60) }),
  SocialLinks: z.object({
    heading: text(200),
    align,
    items: z.array(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: hrefSchema })).max(20),
  }),
  Video: z.object({ url: z.string().max(500), caption: text(300) }),
  Spacer: z.object({ size: z.enum(["sm", "md", "lg"]) }),
  Columns: z.object({
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
};

export function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(blockPropSchemas, type);
}
