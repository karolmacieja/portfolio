import { expect, test } from "@playwright/test";

import { createSiteAndOpen, signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, siteUrl } from "./hosts";

test("Start client: the gallery locks Pro templates and filters by category", async ({ page }) => {
  await signInAsClient(page, "start@example.com");
  await page.goto("/templates");
  await expect(
    page.getByTestId("template-architekt").getByRole("link", { name: "Ulepsz plan" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("template-fotograf").getByRole("link", { name: "Użyj szablonu" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fotografia" }).click();
  await expect(page.getByTestId("template-architekt")).toHaveCount(0);
});

// pro@ rather than start@: other specs already use start@'s single site.
test("a site created from a template copies its pages and can be published", async ({ page }) => {
  await signInAsClient(page, "pro@example.com");
  await page.goto("/templates");
  await page.getByTestId("template-fotograf").getByRole("link", { name: "Użyj szablonu" }).click();
  const slug = `e2e-tpl-${Date.now().toString(36)}`;
  const form = page.getByTestId("use-template-form");
  await form.getByLabel("Nazwa strony").fill("Z szablonu E2E");
  await form.getByLabel("Adres strony").fill(slug);
  await form.getByRole("button", { name: "Utwórz stronę" }).click();

  await expect(page.getByTestId("site-title")).toHaveText("Z szablonu E2E", { timeout: 15_000 });
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.getByTestId("page-galeria")).toBeVisible();
  await page.getByRole("link", { name: "Szablon" }).click();
  await expect(page.getByTestId("current-template")).toHaveText("Aktualny szablon: Fotograf");

  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();
  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: "Imię Nazwisko", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Galeria" })).toBeVisible();
});

test("template preview renders the published version", async ({ page }) => {
  await page.goto("/template-preview/architekt");
  await expect(page.getByRole("heading", { name: "Pracownia Architektury", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Projekty" }).click();
  await expect(page.getByRole("heading", { name: "Dom nad jeziorem" })).toBeVisible();
});

test("switching layout backs up the site and keeps content; the backup can be restored", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signInAsClient(page);
  await createSiteAndOpen(page, "Zmiana układu E2E");

  await page.getByRole("link", { name: "Szablon" }).click();
  await page.getByTestId("template-architekt").getByRole("button", { name: "Zmień układ" }).click();
  await expect(page.getByTestId("template-architekt").getByText("Układ zmieniony.")).toBeVisible();

  await page.getByRole("link", { name: "Podstrony" }).click();
  await expect(page.getByTestId("page-projekty")).toBeVisible();

  await page.getByRole("link", { name: "Historia" }).click();
  const backups = page.getByTestId("backups");
  await expect(backups.getByText("Przed zmianą szablonu")).toBeVisible();
  await backups.getByRole("button", { name: "Przywróć" }).first().click();
  await expect(backups.getByText("Kopia przywrócona.")).toBeVisible();

  await page.getByRole("link", { name: "Podstrony" }).click();
  await expect(page.getByTestId("page-projekty")).toHaveCount(0);
  await expect(page.getByTestId("page-home")).toBeVisible();
});

test("admin creates and publishes a template that clients then see", async ({ page, browser }) => {
  await signInAsAdmin(page);
  await page.goto(adminUrl("/templates"));
  const slug = `e2e-tpl-${Date.now().toString(36)}`;
  const form = page.getByTestId("create-template-form");
  await form.getByLabel("Nazwa").fill("Szablon E2E");
  await form.getByLabel("Identyfikator").fill(slug);
  await form.getByRole("button", { name: "Utwórz" }).click();
  await expect(page.getByTestId("template-title")).toContainText("Szablon E2E");

  await page.getByTestId("template-publish").click();
  await expect(page.getByText("Opublikowano wersję.")).toBeVisible();
  await expect(page.getByTestId("template-title")).toContainText("Opublikowany");

  const client = await browser.newPage();
  await signInAsClient(client, "pro@example.com");
  await client.goto("/templates");
  await expect(client.getByTestId(`template-${slug}`)).toBeVisible();

  await page.getByRole("button", { name: "Archiwizuj" }).click();
  await expect(page.getByTestId("template-title")).toContainText("Zarchiwizowany");
  await client.reload();
  await expect(client.getByTestId(`template-${slug}`)).toHaveCount(0);
});
