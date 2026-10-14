import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { createSiteAndOpen, signInAsClient } from "./helpers";
import { siteUrl } from "./hosts";

test("edits content in the editor and publishes it", async ({ page }) => {
  await signInAsClient(page);
  const slug = await createSiteAndOpen(page, "Edytor E2E");

  await page.getByRole("link", { name: "Edytuj treść" }).click();
  // The editor route is heavy; the first dev-server compile can take a while.
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30_000 });

  // Select the hero block inside the canvas iframe and edit its title in the fields panel.
  const canvas = page.frameLocator("iframe").first();
  await canvas.getByRole("heading", { name: "Edytor E2E" }).click();
  const title = page.getByRole("textbox", { name: "Tytuł", exact: true }).first();
  await title.fill("Nowy tytuł z edytora");
  await expect(canvas.getByRole("heading", { name: "Nowy tytuł z edytora" })).toBeVisible();
  await expect(page.getByTestId("editor-status")).toHaveText("Zapisano", { timeout: 10_000 });

  await page.getByTestId("editor-publish").click();
  await expect(page.getByTestId("editor-status")).toHaveText("Opublikowano!", { timeout: 10_000 });

  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: "Nowy tytuł z edytora", level: 1 })).toBeVisible();
});

test("manages pages, theme, settings and history", async ({ page }) => {
  await signInAsClient(page);
  const slug = await createSiteAndOpen(page, "Zarządzanie E2E");

  // Pages
  const addPage = page.getByTestId("add-page-form");
  await addPage.getByLabel("Tytuł").fill("Kontakt");
  await expect(addPage.getByLabel("Adres")).toHaveValue("kontakt");
  await addPage.getByRole("button", { name: "Dodaj podstronę" }).click();
  await expect(page.getByTestId("page-kontakt")).toBeVisible();

  await addPage.getByLabel("Tytuł").fill("API");
  await addPage.getByLabel("Adres").fill("api");
  await addPage.getByRole("button", { name: "Dodaj podstronę" }).click();
  await expect(addPage.getByTestId("form-error")).toHaveText("Ten adres jest zarezerwowany.");

  // Theme
  await page.getByRole("link", { name: "Motyw" }).click();
  await page.getByRole("button", { name: "Ciemny" }).click();
  await page.getByRole("button", { name: "Zapisz motyw" }).click();
  await expect(page.getByText("Motyw zapisany.")).toBeVisible();

  // Settings
  await page.getByRole("link", { name: "Ustawienia" }).click();
  const settings = page.getByTestId("settings-form");
  await settings.getByLabel("Opis strony (SEO)").fill("Opis z testu E2E");
  await settings.getByLabel("Ukryj stronę przed wyszukiwarkami").check();
  await settings.getByRole("button", { name: "Zapisz ustawienia" }).click();
  await expect(settings.getByText("Ustawienia zapisane.")).toBeVisible();

  // Publish everything
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();

  // History has a first version of each page
  await page.getByRole("link", { name: "Historia" }).click();
  await expect(page.getByText("Wersja 1")).toHaveCount(2);

  // Live site: navigation, theme variables, SEO
  await page.goto(siteUrl(slug));
  await expect(page.getByRole("navigation").getByRole("link", { name: "Kontakt" })).toBeVisible();
  const background = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("--site-bg").trim(),
  );
  expect(background).toBe("#0b0b0c");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Opis z testu E2E");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto(siteUrl(slug, "/robots.txt"));
  await expect(page.locator("body")).toContainText("Disallow: /");
  await page.goto(siteUrl(slug, "/kontakt"));
  await expect(page).toHaveTitle(/Kontakt/);
});

test("uploads an image to the media library", async ({ page }) => {
  await signInAsClient(page);
  await page.goto("/media");
  const before = await page
    .getByTestId("media-grid")
    .locator("li")
    .count()
    .catch(() => 0);

  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#22aa66" } })
    .png()
    .toBuffer();
  await page
    .getByTestId("media-upload-input")
    .setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("media-grid").locator("li")).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(page.getByTestId("media-grid").getByText("e2e.png")).toBeVisible();

  // Non-images are rejected regardless of the declared type.
  await page.getByTestId("media-upload-input").setInputFiles({
    name: "evil.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg onload=alert(1)>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "evil.png" })).toContainText(
    "Plik nie jest prawidłowym obrazem.",
  );
});
