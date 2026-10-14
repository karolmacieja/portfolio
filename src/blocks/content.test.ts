import { describe, expect, it } from "vitest";

import {
  block,
  emptyContent,
  pageContentSchema,
  parseRenderableContent,
  starterContent,
  validatePageContent,
} from "./content";

describe("page content", () => {
  it("starter content is valid and passes strict validation", () => {
    const content = starterContent({ title: "Jan", subtitle: "Fotograf", body: "Hello" });
    expect(pageContentSchema.safeParse(content).success).toBe(true);
    expect(validatePageContent(content).ok).toBe(true);
    const ids = content.content.map((b) => b.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("empty content is valid", () => {
    expect(validatePageContent(emptyContent()).ok).toBe(true);
  });

  it("drops blocks of unknown type when rendering", () => {
    const parsed = parseRenderableContent({
      root: {},
      content: [
        { type: "Spacer", props: { id: "a", size: "sm" } },
        { type: "Script", props: { id: "b", src: "https://evil.example" } },
      ],
    });
    expect(parsed?.content.map((b) => b.type)).toEqual(["Spacer"]);
  });

  it("drops blocks with invalid props and strips unknown props", () => {
    const parsed = parseRenderableContent({
      root: {},
      content: [
        { type: "Spacer", props: { id: "a", size: "huge" } },
        { type: "Text", props: { id: "b", heading: "", align: "left", text: { html: "<script>" } } },
        {
          type: "Text",
          props: {
            id: "c",
            heading: "",
            align: "left",
            text: "ok",
            dangerouslySetInnerHTML: { __html: "x" },
          },
        },
      ],
    });
    expect(parsed?.content).toEqual([
      { type: "Text", props: { id: "c", heading: "", align: "left", text: "ok" } },
    ]);
  });

  it("validates nested blocks in slots", () => {
    const columns = block("Columns", {
      col1: [block("Text", { text: "left" })],
      col2: [{ type: "Text", props: { id: "x", text: 42 } }],
    });
    const parsed = parseRenderableContent({ root: {}, content: [columns] });
    const props = parsed?.content[0]?.props as { col1: unknown[]; col2: unknown[] };
    expect(props.col1).toHaveLength(1);
    expect(props.col2).toHaveLength(0);

    const strict = validatePageContent({ root: {}, content: [columns] });
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.issues[0]?.path).toContain("content[0].col2[0]");
  });

  it("rejects javascript: links and foreign image schemes when saving", () => {
    const result = validatePageContent({
      root: {},
      content: [
        block("Hero", { buttonHref: "javascript:alert(1)" }),
        block("Image", { image: { url: "data:image/svg+xml,<svg onload=alert(1)>", alt: "" } }),
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.message)).toEqual(["invalidHref", "invalidImageUrl"]);
  });

  it("strict validation reports unknown blocks", () => {
    const result = validatePageContent({ root: {}, content: [{ type: "Iframe", props: { id: "a" } }] });
    expect(result).toEqual({ ok: false, issues: [{ path: "content[0]", message: "unknownBlock:Iframe" }] });
  });

  it.each([null, "x", { content: "nope" }, { content: [{ type: "Text", props: {} }] }])(
    "returns null for malformed content %j",
    (value) => {
      expect(parseRenderableContent(value)).toBeNull();
    },
  );
});
