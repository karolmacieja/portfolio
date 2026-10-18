import { describe, expect, it } from "vitest";

import pl from "../../messages/pl.json";

import { BLOCK_CATEGORIES } from "./config";
import { block, validatePageContent } from "./content";
import { BLOCK_TYPES, type BlockType } from "./schemas";

const page = (...content: unknown[]) => ({ root: { props: {} }, content });

describe("blocks added in Phase 13", () => {
  it("every block type is in exactly one editor category and has a name", () => {
    const listed = Object.values(BLOCK_CATEGORIES).flat();
    expect([...listed].sort()).toEqual([...BLOCK_TYPES].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const type of BLOCK_TYPES)
      expect(pl.blocks.names[type as keyof typeof pl.blocks.names]).toBeTruthy();
  });

  it("defaults of every block pass strict validation", () => {
    const content = page(...BLOCK_TYPES.map((type: BlockType) => block(type)));
    expect(validatePageContent(content)).toMatchObject({ ok: true });
  });

  it("validates blocks nested in a Section, recursively", () => {
    const section = block("Section", {
      gradient: "diagonal",
      gradientFrom: "primary",
      gradientTo: "#ff8800",
      content: [block("Heading", { text: "Hi" }), block("Columns", { col1: [block("Stats")] })],
    });
    expect(validatePageContent(page(section)).ok).toBe(true);

    const bad = block("Section", { content: [{ type: "Heading", props: { id: "h", level: "h9" } }] });
    const result = validatePageContent(page(bad));
    expect(result.ok).toBe(false);
  });

  it("refuses unsafe links, files, colours and unknown icons", () => {
    const cases: unknown[] = [
      block("Buttons", { items: [{ label: "x", href: "javascript:alert(1)", variant: "primary" }] }),
      block("FileDownload", { file: { url: "javascript:alert(1)", name: "cv.pdf" } }),
      block("Section", { gradientFrom: "red;}body{display:none" as never }),
      {
        type: "IconList",
        props: { ...block("IconList").props, items: [{ icon: "skull", title: "", text: "" }] },
      },
      block("Pricing", {
        items: [
          {
            name: "A",
            price: "1",
            period: "",
            description: "",
            features: "",
            buttonLabel: "Go",
            buttonHref: "data:text/html,x",
            featured: false,
          },
        ],
      }),
    ];
    for (const item of cases) expect(validatePageContent(page(item)).ok).toBe(false);
  });
});
