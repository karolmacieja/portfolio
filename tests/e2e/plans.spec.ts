import { expect, test } from "@playwright/test";

import { createSiteAndOpen, signInAsClient } from "./helpers";
import { siteUrl } from "./hosts";

test("plans page lists the seeded plans with prices", async ({ page }) => {
  await signInAsClient(page, "pro@example.com");
  await page.goto("/plans");
  for (const slug of ["start", "pro", "business"])
    await expect(page.getByTestId(`plan-${slug}`)).toBeVisible();
  await expect(page.getByTestId("plan-start")).toContainText("19,00 zł / mies.");
  await expect(page.getByTestId("plan-pro")).toContainText("Aktualny");
});

test("without a plan: edit yes, publish no, entry limits apply", async ({ page }) => {
  await signInAsClient(page, "free@example.com");
  await expect(page.getByTestId("plan-name")).toHaveText("Brak aktywnego planu");

  await createSiteAndOpen(page, "Bez planu E2E");
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByTestId("publish-error")).toContainText("Publikacja wymaga aktywnego planu");
  await expect(page.getByTestId("publish-error").getByRole("link", { name: "Zobacz plany" })).toBeVisible();

  // The entry plan (Start) allows a single site.
  await page.goto("/dashboard");
  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill("Druga strona");
  await form.getByLabel("Adres strony").fill(`e2e-second-${Date.now().toString(36)}`);
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  await expect(form.getByTestId("form-error")).toHaveText("Osiągnięto limit stron w Twoim planie.");
});

test("Start plan: Pro blocks are locked in the editor; branding is shown", async ({ page }) => {
  await signInAsClient(page, "start@example.com");
  const slug = await createSiteAndOpen(page, "Start E2E");
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();

  await page.getByRole("link", { name: "Edytuj treść" }).click();
  // Puck renders the block drawer in more than one place; check the first one.
  const lockedVideo = page.getByTestId("locked-block-Video").first();
  await expect(lockedVideo).toBeVisible({ timeout: 30_000 });
  await expect(lockedVideo.getByRole("link", { name: "Ulepsz" })).toHaveAttribute("href", "/plans");

  await page.goto(siteUrl(slug));
  await expect(page.getByTestId("site-branding")).toBeVisible();
});

test("Pro plan: published site has no branding footer", async ({ page }) => {
  await signInAsClient(page, "pro@example.com");
  const slug = await createSiteAndOpen(page, "Pro E2E");
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();

  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: "Pro E2E", level: 1 })).toBeVisible();
  await expect(page.getByTestId("site-branding")).toHaveCount(0);
});
