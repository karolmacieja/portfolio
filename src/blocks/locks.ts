import { z } from "zod";

import { walkBlocks } from "./content";

/**
 * Template lock rules: per block id, which actions clients may not perform.
 * Applied in the editor (Puck permissions) and enforced on save (delete / edit).
 * Drag locks are editor-only: moving a block cannot break a template's structure in a harmful way.
 */
export const lockRuleSchema = z.object({
  edit: z.literal(false).optional(),
  drag: z.literal(false).optional(),
  delete: z.literal(false).optional(),
});
export type LockRule = z.infer<typeof lockRuleSchema>;
export const lockRulesSchema = z.record(z.string().min(1).max(128), lockRuleSchema);
export type LockRules = z.infer<typeof lockRulesSchema>;

export function parseLockRules(value: unknown): LockRules {
  const parsed = lockRulesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Drops rules without restrictions and rules for blocks that no longer exist. */
export function normalizeLockRules(rules: LockRules, content: unknown): LockRules {
  const ids = new Set<string>();
  walkBlocks(content, (block) => typeof block.props.id === "string" && ids.add(block.props.id));
  return Object.fromEntries(
    Object.entries(rules).filter(([id, rule]) => ids.has(id) && Object.keys(rule).length > 0),
  );
}

/** Structural equality; object key order is ignored (Postgres jsonb reorders keys). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as never)[k], (b as never)[k]));
}

function blocksById(content: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  walkBlocks(content, (block) => typeof block.props.id === "string" && map.set(block.props.id, block.props));
  return map;
}

export type LockViolation = { blockId: string; rule: "delete" | "edit" };

/** Changes from `previous` to `next` that the lock rules forbid. */
export function findLockViolations(next: unknown, previous: unknown, rules: LockRules): LockViolation[] {
  const before = blocksById(previous);
  const after = blocksById(next);
  const violations: LockViolation[] = [];
  for (const [blockId, rule] of Object.entries(rules)) {
    const old = before.get(blockId);
    if (!old) continue;
    const current = after.get(blockId);
    if (rule.delete === false && !current) violations.push({ blockId, rule: "delete" });
    else if (rule.edit === false && current && !deepEqual(current, old)) {
      violations.push({ blockId, rule: "edit" });
    }
  }
  return violations;
}
