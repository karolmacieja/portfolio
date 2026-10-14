import type { Data } from "@puckeditor/core";
import { z } from "zod";

import { blockPropSchemas, type BlockProps, type BlockType } from "./config";

/**
 * Stored page content (Puck `Data`). Validated on every write and before rendering,
 * so malformed or foreign JSON never reaches the renderer.
 */

const blockSchema = z.object({
  type: z.string().min(1).max(64),
  props: z.looseObject({ id: z.string().min(1).max(128) }),
});

export const pageContentSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).default({}),
  content: z.array(blockSchema).max(500),
  zones: z.record(z.string(), z.array(blockSchema)).optional(),
});

export type PageContent = z.infer<typeof pageContentSchema>;

export function emptyContent(): PageContent {
  return { root: { props: {} }, content: [] };
}

let idCounter = 0;
function blockId(type: string): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function block<T extends keyof BlockProps>(type: T, props: BlockProps[T]) {
  return { type, props: { id: blockId(type), ...props } };
}

/** Initial draft for a new site, until templates (Phase 4) provide real starting points. */
export function starterContent(params: { title: string; subtitle: string; body: string }): PageContent {
  return {
    root: { props: {} },
    content: [
      block("Hero", { title: params.title, subtitle: params.subtitle, align: "center" }),
      block("Text", { text: params.body }),
      block("Spacer", { size: "md" }),
    ],
  };
}

export type RenderableContent = Data<BlockProps>;

function isBlockType(type: string): type is BlockType {
  return Object.hasOwn(blockPropSchemas, type);
}

/**
 * Parses stored content for rendering: invalid documents yield null; blocks of unknown types
 * (e.g. removed from the library) or with invalid props are dropped instead of breaking the page.
 */
export function parseRenderableContent(value: unknown): RenderableContent | null {
  const result = pageContentSchema.safeParse(value);
  if (!result.success) return null;

  const content: RenderableContent["content"] = [];
  for (const block of result.data.content) {
    if (!isBlockType(block.type)) continue;
    const props = blockPropSchemas[block.type].safeParse(block.props);
    if (!props.success) continue;
    content.push({
      type: block.type,
      props: { ...props.data, id: block.props.id },
    } as RenderableContent["content"][number]);
  }
  return { root: { props: {} }, content };
}
