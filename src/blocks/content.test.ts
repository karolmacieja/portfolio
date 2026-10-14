import { describe, expect, it } from "vitest";

import { emptyContent, pageContentSchema, parseRenderableContent, starterContent } from "./content";

describe("page content", () => {
  it("starter content is valid and uses known blocks", () => {
    const content = starterContent({ title: "Jan", subtitle: "Fotograf", body: "Hello" });
    expect(pageContentSchema.safeParse(content).success).toBe(true);
    expect(content.content.map((b) => b.type)).toEqual(["Hero", "Text", "Spacer"]);
    const ids = content.content.map((b) => b.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("empty content is valid", () => {
    expect(pageContentSchema.safeParse(emptyContent()).success).toBe(true);
  });

  it("drops blocks of unknown type when rendering", () => {
    const parsed = parseRenderableContent({
      root: {},
      content: [
        { type: "Text", props: { id: "a", text: "ok" } },
        { type: "Script", props: { id: "b", src: "https://evil.example" } },
      ],
    });
    expect(parsed?.content.map((b) => b.type)).toEqual(["Text"]);
  });

  it("drops blocks with invalid props and strips unknown props", () => {
    const parsed = parseRenderableContent({
      root: {},
      content: [
        { type: "Spacer", props: { id: "a", size: "huge" } },
        { type: "Text", props: { id: "b", text: { html: "<script>" } } },
        { type: "Text", props: { id: "c", text: "ok", dangerouslySetInnerHTML: { __html: "x" } } },
      ],
    });
    expect(parsed?.content).toEqual([{ type: "Text", props: { id: "c", text: "ok" } }]);
  });

  it.each([null, "x", { content: "nope" }, { content: [{ type: "Text", props: {} }] }])(
    "returns null for malformed content %j",
    (value) => {
      expect(parseRenderableContent(value)).toBeNull();
    },
  );
});
