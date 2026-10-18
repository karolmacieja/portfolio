import { describe, expect, it } from "vitest";

import { appearanceFrame, blockAppearanceSchema, colorCss } from "./appearance";
import { validatePageContent } from "./content";

describe("block appearance", () => {
  it("accepts theme tokens, custom hex colours and inherit, and refuses anything else", () => {
    for (const ok of ["", "primary", "accent", "#a1b2c3"]) {
      expect(blockAppearanceSchema.safeParse({ background: ok }).success).toBe(true);
    }
    for (const bad of ["red", "#fff", "#12345g", "var(--x)", "#000000; background:url(x)"]) {
      expect(blockAppearanceSchema.safeParse({ background: bad }).success).toBe(false);
    }
  });

  it("fills defaults for partial values", () => {
    expect(blockAppearanceSchema.parse({ text: "muted" })).toEqual({
      background: "",
      text: "muted",
      paddingTop: "default",
      paddingBottom: "default",
      width: "default",
      hideOn: "none",
      animation: "none",
    });
  });

  it("maps colours to palette variables or literal hex", () => {
    expect(colorCss("")).toBeUndefined();
    expect(colorCss("primaryForeground")).toBe("var(--site-c-primaryForeground)");
    expect(colorCss("#00ff00")).toBe("#00ff00");
  });

  it("builds the frame: variables, classes, no animation or hiding while editing", () => {
    const appearance = {
      background: "surface",
      text: "#222222",
      paddingTop: "none",
      paddingBottom: "xl",
      width: "full",
      hideOn: "mobile",
      animation: "fade",
    } as const;
    const live = appearanceFrame(appearance, false);
    expect(live.className.split(" ")).toEqual([
      "blk",
      "blk-has-bg",
      "blk-full",
      "blk-hide-mobile",
      "blk-anim-fade",
    ]);
    expect(live.style).toMatchObject({
      background: "var(--site-c-surface)",
      color: "#222222",
      "--blk-pt": "0px",
      "--blk-pb": "8rem",
      "--blk-max": "none",
    });
    expect(appearanceFrame(appearance, true).className.split(" ")).toEqual([
      "blk",
      "blk-has-bg",
      "blk-full",
      "blk-edit-hide-mobile",
    ]);
    expect(appearanceFrame(undefined, false)).toEqual({ className: "blk", style: {} });
  });

  it("is validated as part of every block when saving", () => {
    const content = (appearance: unknown) => ({
      root: { props: {} },
      content: [{ type: "Text", props: { id: "t1", heading: "", text: "x", align: "left", appearance } }],
    });
    expect(validatePageContent(content({ background: "#ff0000" })).ok).toBe(true);
    expect(validatePageContent(content({ background: "url(javascript:x)" })).ok).toBe(false);
    // Blocks saved before appearance existed stay valid.
    expect(validatePageContent(content(undefined)).ok).toBe(true);
  });
});
