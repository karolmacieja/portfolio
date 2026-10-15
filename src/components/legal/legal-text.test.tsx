import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LegalText } from "./legal-text";

describe("LegalText", () => {
  it("renders headings, lists and paragraphs as plain text", () => {
    const html = renderToStaticMarkup(
      <LegalText content={"## 1. Zasady\n\n- jeden\n- dwa\n\nTekst <script>alert(1)</script>"} />,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("<li>dwa</li>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
