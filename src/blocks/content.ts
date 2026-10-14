import type { Data } from "@puckeditor/core";
import { z } from "zod";

import { blockDefaults } from "./defaults";
import { blockPropSchemas, isBlockType, SLOT_PROPS, type BlockProps, type BlockType } from "./schemas";

/**
 * Stored page content (Puck `Data`). The document shape is validated here; block props by
 * `blockPropSchemas`, recursively through slot props (nested blocks).
 */

const MAX_DEPTH = 4;
const MAX_BLOCKS = 500;

const blockShape = z.object({
  type: z.string().min(1).max(64),
  props: z.looseObject({ id: z.string().min(1).max(128) }),
});

export const pageContentSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).default({}),
  content: z.array(blockShape).max(MAX_BLOCKS),
  zones: z.record(z.string(), z.array(blockShape)).optional(),
});

export type PageContent = z.infer<typeof pageContentSchema>;
export type RenderableContent = Data<BlockProps>;
type RenderableBlock = RenderableContent["content"][number];

export function emptyContent(): PageContent {
  return { root: { props: {} }, content: [] };
}

export type ContentIssue = { path: string; message: string };

/**
 * Validates and normalizes blocks. In strict mode every problem is reported (used when saving);
 * otherwise unknown or invalid blocks are silently dropped (used when rendering).
 */
function parseBlocks(
  raw: unknown,
  path: string,
  depth: number,
  issues: ContentIssue[] | null,
  counter: { count: number },
): RenderableBlock[] {
  const list = z.array(blockShape).safeParse(raw);
  if (!list.success) {
    issues?.push({ path, message: "invalidBlockList" });
    return [];
  }

  const blocks: RenderableBlock[] = [];
  list.data.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    counter.count += 1;
    if (counter.count > MAX_BLOCKS) {
      issues?.push({ path: blockPath, message: "tooManyBlocks" });
      return;
    }
    if (!isBlockType(block.type)) {
      issues?.push({ path: blockPath, message: `unknownBlock:${block.type}` });
      return;
    }
    const props = blockPropSchemas[block.type].safeParse(block.props);
    if (!props.success) {
      for (const issue of props.error.issues) {
        issues?.push({ path: `${blockPath}.${issue.path.join(".")}`, message: issue.message });
      }
      return;
    }

    const normalized: Record<string, unknown> = { ...props.data, id: block.props.id };
    for (const slotProp of SLOT_PROPS[block.type] ?? []) {
      if (depth >= MAX_DEPTH) {
        if ((normalized[slotProp] as unknown[]).length > 0)
          issues?.push({ path: blockPath, message: "tooDeep" });
        normalized[slotProp] = [];
        continue;
      }
      normalized[slotProp] = parseBlocks(
        normalized[slotProp],
        `${blockPath}.${slotProp}`,
        depth + 1,
        issues,
        counter,
      );
    }
    blocks.push({ type: block.type, props: normalized } as RenderableBlock);
  });
  return blocks;
}

/** Lenient parse for rendering: invalid documents yield null, invalid blocks are dropped. */
export function parseRenderableContent(value: unknown): RenderableContent | null {
  const result = pageContentSchema.safeParse(value);
  if (!result.success) return null;
  return { root: { props: {} }, content: parseBlocks(result.data.content, "content", 0, null, { count: 0 }) };
}

/** Strict validation for saving: returns normalized content or the list of problems. */
export function validatePageContent(
  value: unknown,
): { ok: true; content: RenderableContent } | { ok: false; issues: ContentIssue[] } {
  const result = pageContentSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const issues: ContentIssue[] = [];
  const content = parseBlocks(result.data.content, "content", 0, issues, { count: 0 });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, content: { root: { props: {} }, content } };
}

let idCounter = 0;
export function newBlockId(type: string): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Builds a block with defaults filled in (seed data, templates, starter content). */
export function block<T extends BlockType>(type: T, props: Partial<BlockProps[T]> = {}) {
  return { type, props: { ...blockDefaults[type], ...props, id: newBlockId(type) } };
}

/** Initial draft for a new site, until templates (Phase 4) provide real starting points. */
export function starterContent(params: { title: string; subtitle: string; body: string }): PageContent {
  return {
    root: { props: {} },
    content: [
      block("Hero", { title: params.title, subtitle: params.subtitle }),
      block("Text", { text: params.body }),
      block("Spacer", { size: "md" }),
    ],
  };
}

type AnyBlock = { type: string; props: Record<string, unknown> };

/** Visits every block, including blocks nested in slot props. Works on unvalidated JSON. */
export function walkBlocks(content: unknown, visit: (block: AnyBlock) => void, depth = 0): void {
  const list = (content as { content?: unknown } | null)?.content ?? content;
  if (!Array.isArray(list) || depth > MAX_DEPTH) return;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const block = item as AnyBlock;
    if (typeof block.type !== "string" || !block.props || typeof block.props !== "object") continue;
    visit(block);
    for (const slotProp of isBlockType(block.type) ? (SLOT_PROPS[block.type] ?? []) : []) {
      walkBlocks(block.props[slotProp], visit, depth + 1);
    }
  }
}
