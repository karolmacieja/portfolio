import { describe, expect, it } from "vitest";

import { block } from "@/blocks/content";

import { mapTemplateContent } from "./mapping";

const doc = (...blocks: { type: string; props: Record<string, unknown> }[]) => ({
  root: { props: {} },
  content: blocks,
});

describe("mapTemplateContent", () => {
  it("fills template blocks with old props of the same type, keeping template ids", () => {
    const tHero = block("Hero", { title: "Template title" });
    const tGallery = block("Gallery", { heading: "Template gallery" });
    const tVideo = block("Video", { url: "https://youtu.be/dQw4w9WgXcQ" });
    const oldHero = block("Hero", { title: "My name", subtitle: "Photographer" });
    const oldGallery = block("Gallery", { heading: "My work" });

    const [home] = mapTemplateContent(
      [{ path: "", content: doc(tHero, tGallery, tVideo), lockRules: {} }],
      [{ path: "", content: doc(oldGallery, oldHero) }],
    );
    const blocks = home!.content as { type: string; props: Record<string, unknown> }[];
    expect(blocks.map((b) => b.props.id)).toEqual([tHero.props.id, tGallery.props.id, tVideo.props.id]);
    expect(blocks[0]!.props).toMatchObject({ title: "My name", subtitle: "Photographer" });
    expect(blocks[1]!.props).toMatchObject({ heading: "My work" });
    expect(blocks[2]!.props).toMatchObject({ url: "https://youtu.be/dQw4w9WgXcQ" });
  });

  it("keeps locked template blocks unchanged", () => {
    const tHero = block("Hero", { title: "Locked" });
    const [home] = mapTemplateContent(
      [{ path: "", content: doc(tHero), lockRules: { [tHero.props.id]: { edit: false } } }],
      [{ path: "", content: doc(block("Hero", { title: "Mine" })) }],
    );
    expect((home!.content[0] as { props: { title: string } }).props.title).toBe("Locked");
  });

  it("pairs pages by path, then by order, and uses leftovers from unpaired pages", () => {
    const pages = mapTemplateContent(
      [
        { path: "", content: doc(block("Hero")), lockRules: {} },
        { path: "projekty", content: doc(block("Text"), block("Text")), lockRules: {} },
      ],
      [
        { path: "", content: doc(block("Hero", { title: "Home" })) },
        { path: "o-mnie", content: doc(block("Text", { text: "About me" })) },
        { path: "kontakt", content: doc(block("Text", { text: "Contact" })) },
      ],
    );
    const texts = (pages[1]!.content as { props: { text: string } }[]).map((b) => b.props.text);
    expect((pages[0]!.content[0] as { props: { title: string } }).props.title).toBe("Home");
    expect(texts).toEqual(["About me", "Contact"]);
  });

  it("maps blocks nested inside template columns", () => {
    const tColumns = block("Columns", { col1: [block("Text", { text: "T" })] });
    const [home] = mapTemplateContent(
      [{ path: "", content: doc(tColumns), lockRules: {} }],
      [{ path: "", content: doc(block("Text", { text: "Mine" })) }],
    );
    const col1 = (home!.content[0] as { props: { col1: { props: { text: string } }[] } }).props.col1;
    expect(col1[0]!.props.text).toBe("Mine");
  });
});
