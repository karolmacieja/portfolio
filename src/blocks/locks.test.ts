import { describe, expect, it } from "vitest";

import { block } from "./content";
import { deepEqual, findLockViolations, normalizeLockRules, parseLockRules } from "./locks";

const hero = block("Hero", { title: "Studio" });
const text = block("Text", { text: "Hello" });
const doc = (...blocks: unknown[]) => ({ root: {}, content: blocks });

describe("lock rules", () => {
  it("parses and ignores invalid rules", () => {
    expect(parseLockRules({ a: { delete: false } })).toEqual({ a: { delete: false } });
    expect(parseLockRules({ a: { delete: true } })).toEqual({});
    expect(parseLockRules("nope")).toEqual({});
  });

  it("normalizes away empty rules and rules for missing blocks", () => {
    const rules = {
      [hero.props.id]: { edit: false as const },
      [text.props.id]: {},
      missing: { delete: false as const },
    };
    expect(normalizeLockRules(rules, doc(hero, text))).toEqual({ [hero.props.id]: { edit: false } });
  });

  it("forbids deleting delete-locked blocks", () => {
    const rules = { [hero.props.id]: { delete: false as const } };
    expect(findLockViolations(doc(text), doc(hero, text), rules)).toEqual([
      { blockId: hero.props.id, rule: "delete" },
    ]);
    // Moving is fine.
    expect(findLockViolations(doc(text, hero), doc(hero, text), rules)).toEqual([]);
  });

  it("forbids editing edit-locked blocks, allows editing others", () => {
    const rules = { [hero.props.id]: { edit: false as const } };
    const edited = { ...hero, props: { ...hero.props, title: "Changed" } };
    expect(findLockViolations(doc(edited), doc(hero), rules)).toEqual([
      { blockId: hero.props.id, rule: "edit" },
    ]);
    const textEdited = { ...text, props: { ...text.props, text: "Changed" } };
    expect(findLockViolations(doc(hero, textEdited), doc(hero, text), rules)).toEqual([]);
  });

  it("checks blocks nested in columns", () => {
    const inner = block("Text", { text: "inner" });
    const columns = block("Columns", { col1: [inner] });
    const rules = { [inner.props.id]: { delete: false as const } };
    const without = { ...columns, props: { ...columns.props, col1: [] } };
    expect(findLockViolations(doc(without), doc(columns), rules)).toEqual([
      { blockId: inner.props.id, rule: "delete" },
    ]);
  });
});

describe("deepEqual", () => {
  it("ignores key order but not values", () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: undefined }, {})).toBe(false);
  });
});
