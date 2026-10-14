import { expect, type Page } from "@playwright/test";

import { PASSWORD } from "./hosts";

export async function signInAsClient(page: Page, email = "client@example.com") {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").first().fill(email);
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Creates a fresh site from the dashboard and opens its management page. Returns the slug. */
export async function createSiteAndOpen(page: Page, name: string): Promise<string> {
  const slug = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill(name);
  await form.getByLabel("Adres strony").fill(slug);
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  const card = page.getByTestId(`site-${slug}`);
  await card.getByRole("link", { name: "Zarządzaj" }).click();
  await expect(page.getByTestId("site-title")).toHaveText(name);
  return slug;
}
