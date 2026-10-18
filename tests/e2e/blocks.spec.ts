import { expect, test } from "@playwright/test";

import { createPublishedSite, sql } from "./db";
import { signInAsClient } from "./helpers";
import { siteUrl } from "./hosts";

// Phase 13: blank start, new blocks with appearance, PDF documents, template detach.

test("a blank site starts with no blocks and a hint in the editor", async ({ page }) => {
  await signInAsClient(page);
  const slug = `e2e-${Date.now().toString(36)}blank`;
  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill("Pusta E2E");
  await form.getByLabel("Adres strony").fill(slug);
  await form.getByTestId("start-blank").check();
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  await page.getByTestId(`site-${slug}`).getByRole("link", { name: "Zarządzaj" }).click();

  await page.getByRole("link", { name: "Edytuj treść" }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });
  const canvas = page.frameLocator("iframe").first();
  await expect(canvas.getByTestId("editor-empty-hint")).toBeVisible({ timeout: 30_000 });
  // The drawer offers the new blocks.
  await expect(page.getByText("Sekcja z tłem", { exact: true }).first()).toBeVisible();
});

test("new blocks and per-block appearance render on the live site", async ({ page }) => {
  const { slug } = await createPublishedSite("client@example.com", [
    {
      type: "Heading",
      props: { id: "h1", text: "Bloki E2E", subtitle: "", level: "h1", size: "lg", align: "center" },
    },
    {
      type: "Faq",
      props: {
        id: "faq",
        heading: "FAQ",
        items: [{ question: "Pytanie testowe?", answer: "Odpowiedź testowa." }],
      },
    },
    {
      type: "FileDownload",
      props: {
        id: "file",
        heading: "CV",
        description: "",
        file: { url: "/storage/u/e2e/cv.pdf", name: "CV.pdf", sizeBytes: 2048 },
        buttonLabel: "",
      },
    },
    {
      type: "Section",
      props: {
        id: "band",
        image: { url: "", alt: "" },
        overlay: "none",
        gradient: "horizontal",
        gradientFrom: "primary",
        gradientTo: "#ff8800",
        minHeight: "auto",
        verticalAlign: "center",
        content: [
          {
            type: "Stats",
            props: { id: "stats", heading: "", items: [{ value: "120+", label: "projektów" }] },
          },
        ],
      },
    },
    {
      type: "Text",
      props: {
        id: "desk",
        heading: "Tylko na komputerze",
        text: "Treść",
        align: "left",
        appearance: { background: "#123456", text: "#ffffff", hideOn: "mobile" },
      },
    },
  ]);

  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: "Bloki E2E", level: 1 })).toBeVisible();

  // FAQ opens without JavaScript (native <details>).
  await expect(page.getByText("Odpowiedź testowa.")).toBeHidden();
  await page.getByText("Pytanie testowe?").click();
  await expect(page.getByText("Odpowiedź testowa.")).toBeVisible();

  const download = page.getByTestId("file-download");
  await expect(download).toHaveText("Pobierz");
  await expect(download).toHaveAttribute("download", "CV.pdf");
  await expect(download).toHaveAttribute("href", "/storage/u/e2e/cv.pdf");

  // Blocks nested in a Section render; the band carries the gradient.
  await expect(page.getByText("120+")).toBeVisible();
  const band = page.locator("section.site-band");
  expect(await band.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");

  // Appearance: custom colours, hidden on phones.
  const desk = page.getByRole("heading", { name: "Tylko na komputerze" });
  await expect(desk).toBeVisible();
  const frame = desk.locator("xpath=ancestor::div[contains(@class, 'blk')][1]");
  expect(await frame.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(18, 52, 86)");
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(desk).toBeHidden();
});

test("PDF documents in the media library download as attachments", async ({ page }) => {
  await signInAsClient(page);
  await page.goto("/media");
  await page.getByTestId("media-upload-input").setInputFiles({
    name: "e2e.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await page.getByRole("button", { name: "Dokumenty" }).click();
  const tile = page.getByTestId("media-grid").getByText("e2e.pdf").first();
  await expect(tile).toBeVisible({ timeout: 15_000 });

  const [asset] = await sql<{ url: string }>(
    `SELECT url FROM "Asset" WHERE "originalName" = 'e2e.pdf' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  const headers = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return {
      type: response.headers.get("content-type"),
      disposition: response.headers.get("content-disposition"),
    };
  }, asset!.url);
  expect(headers).toEqual({ type: "application/pdf", disposition: "attachment" });
});

test("a site can be detached from its template's block locks", async ({ page }) => {
  const { siteId } = await createPublishedSite("client@example.com", [
    { type: "Text", props: { id: "locked", heading: "Zablokowany", text: "", align: "left" } },
  ]);
  await sql(
    `UPDATE "Page" SET "lockRules" = '{"locked":{"delete":false,"edit":false}}' WHERE "siteId" = $1`,
    [siteId],
  );

  await signInAsClient(page);
  await page.goto(`/sites/${siteId}/template`);
  const locks = page.getByTestId("template-locks");
  await expect(locks).toContainText("1 podstrona ma bloki zablokowane przez szablon");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("detach-template").click();
  // With no locks left the section disappears.
  await expect(page.getByTestId("template-locks")).toHaveCount(0, { timeout: 15_000 });

  await page.goto(`/sites/${siteId}/history`);
  await expect(page.getByText("Przed odłączeniem od szablonu")).toBeVisible();
});
