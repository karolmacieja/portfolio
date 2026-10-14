import { isBlockType, SLOT_PROPS } from "@/blocks/schemas";
import type { LockRules } from "@/blocks/locks";

/**
 * Layout switch with content mapping: the new template's blocks are filled with the props of
 * existing blocks of the same type, in order (Hero -> Hero, Gallery -> Gallery, ...).
 * Locked template blocks keep the template's content; slot children are mapped recursively.
 * Unmatched old blocks are not lost: the whole site is backed up before switching.
 */

type Block = { type: string; props: Record<string, unknown> };

function topLevelBlocks(content: unknown): Block[] {
  const list = (content as { content?: unknown } | null)?.content;
  return Array.isArray(list)
    ? (list.filter((b) => b && typeof b === "object" && typeof b.type === "string") as Block[])
    : [];
}

/** Queue of old blocks per type (top level and nested), consumed in order. */
function queueByType(contents: unknown[]): Map<string, Block[]> {
  const queues = new Map<string, Block[]>();
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (!queues.has(b.type)) queues.set(b.type, []);
      queues.get(b.type)!.push(b);
      for (const slot of isBlockType(b.type) ? (SLOT_PROPS[b.type] ?? []) : []) {
        const children = b.props[slot];
        if (Array.isArray(children)) visit(children as Block[]);
      }
    }
  };
  for (const content of contents) visit(topLevelBlocks(content));
  return queues;
}

function mapBlocks(blocks: Block[], queues: Map<string, Block[]>, locks: LockRules): Block[] {
  return blocks.map((templateBlock) => {
    const id = templateBlock.props.id as string;
    const slotProps = isBlockType(templateBlock.type) ? (SLOT_PROPS[templateBlock.type] ?? []) : [];
    const mappedSlots = Object.fromEntries(
      slotProps.map((slot) => [slot, mapBlocks((templateBlock.props[slot] as Block[]) ?? [], queues, locks)]),
    );
    if (locks[id]?.edit === false || slotProps.length > 0) {
      return { ...templateBlock, props: { ...templateBlock.props, ...mappedSlots } };
    }
    const source = queues.get(templateBlock.type)?.shift();
    if (!source) return templateBlock;
    return { type: templateBlock.type, props: { ...source.props, id } };
  });
}

/**
 * Maps old page contents onto template pages. Pages are paired by path, remaining ones by order;
 * blocks are taken from the paired old page first, then from any other old page.
 */
export function mapTemplateContent(
  templatePages: { path: string; content: { root?: unknown; content: unknown[] }; lockRules: LockRules }[],
  oldPages: { path: string; content: unknown }[],
): { root: unknown; content: unknown[] }[] {
  const remaining = [...oldPages];
  const paired = templatePages.map((page) => {
    const index = remaining.findIndex((old) => old.path === page.path);
    return index >= 0 ? remaining.splice(index, 1)[0] : undefined;
  });
  const result = templatePages.map((page, i) => {
    const old = paired[i] ?? remaining.shift();
    const queues = queueByType(old ? [old.content] : []);
    return { page, queues };
  });
  // Leftover blocks from unpaired pages are available to every page, in order.
  const shared = queueByType(remaining.map((p) => p.content));

  return result.map(({ page, queues }) => {
    for (const [type, list] of shared) queues.set(type, [...(queues.get(type) ?? []), ...list]);
    const mapped = mapBlocks(page.content.content as Block[], queues, page.lockRules);
    // Blocks consumed here must not be reused on later pages.
    for (const [type, list] of queues)
      shared.set(
        type,
        list.filter((b) => shared.get(type)?.includes(b)),
      );
    return { root: page.content.root ?? { props: {} }, content: mapped };
  });
}
