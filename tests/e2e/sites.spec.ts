import { expect, test } from "@playwright/test";

import { hostUrl, PASSWORD, siteUrl } from "./hosts";

test("marketing site is served on the root domain", async ({ page }) => {
  await page.goto(hostUrl(null));
  await expect(page.getByRole("heading", { name: "Twoje portfolio online w kilka minut" })).toBeVisible();
});

test("published demo site renders on its subdomain", async ({ page }) => {
  const response = await page.goto(siteUrl("jan"));
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Jan Kowalski", level: 1 })).toBeVisible();
  await expect(page.getByText("Fotograf · Warszawa")).toBeVisible();
  // The demo site's owner is on Business (removeBranding).
  await expect(page.getByTestId("site-branding")).toHaveCount(0);
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("connected custom domain (dev-domains.json) serves the same site", async ({ page }) => {
  await page.goto(hostUrl("jan-kowalski.pl"));
  await expect(page.getByRole("heading", { name: "Jan Kowalski", level: 1 })).toBeVisible();
});

test("suspended site shows a notice instead of its content", async ({ page }) => {
  await page.goto(siteUrl("zawieszona"));
  await expect(page.getByTestId("site-suspended")).toBeVisible();
  await expect(page.getByText("Tej treści nie powinno być widać.")).toHaveCount(0);
});

// Navigations go through Chromium, which resolves *.localhost (Node's resolver used by
// `request` fixtures does not).
test("unknown and reserved subdomains return 404", async ({ page }) => {
  for (const url of [
    siteUrl("nie-ma-takiej-strony"),
    siteUrl("jan", "/nie-ma"),
    hostUrl("api"),
    siteUrl("jan", "/api/auth/session"),
  ]) {
    expect((await page.goto(url))?.status(), url).toBe(404);
  }
});

test("client creates a site, publishes it and sees it on the subdomain", async ({ page }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  const probe = await page.context().newPage();
  // Visiting the address before the site exists caches a "no such site" lookup,
  // which creating the site must invalidate.
  expect((await probe.goto(siteUrl(slug)))?.status()).toBe(404);

  await page.goto("/login");
  await page.getByLabel("Adres e-mail").first().fill("client@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill("Portfolio testowe");
  await expect(form.getByLabel("Adres strony")).toHaveValue("portfolio-testowe");
  await form.getByLabel("Adres strony").fill(slug);
  await form.getByRole("button", { name: "Utwórz stronę" }).click();

  const card = page.getByTestId(`site-${slug}`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Nieopublikowana")).toBeVisible();

  // Not served before publishing (and the 404 must not stick in the cache afterwards).
  // Created but not published yet: still not served.
  expect((await probe.goto(siteUrl(slug)))?.status()).toBe(404);

  await card.getByRole("button", { name: "Opublikuj" }).click();
  await expect(card.getByText("Strona została opublikowana.")).toBeVisible();
  await expect(card.getByText("Opublikowana", { exact: true })).toBeVisible();

  expect((await probe.goto(siteUrl(slug)))?.status()).toBe(200);
  await expect(probe.getByRole("heading", { name: "Portfolio testowe", level: 1 })).toBeVisible();
  await probe.close();

  await page.goto(siteUrl(slug));
  await expect(page.getByText("Witaj na mojej stronie portfolio.")).toBeVisible();
});

test("taken and reserved slugs are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").first().fill("client@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill("Duplikat");
  await form.getByLabel("Adres strony").fill("jan");
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  await expect(form.getByTestId("form-error")).toHaveText("Ten adres jest już zajęty. Wybierz inny.");

  await form.getByLabel("Adres strony").fill("admin");
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  await expect(form.getByTestId("form-error")).toHaveText("Ten adres jest zarezerwowany. Wybierz inny.");
});
