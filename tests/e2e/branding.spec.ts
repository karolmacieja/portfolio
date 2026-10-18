import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { createBillingUser, createPublishedSite, sql } from "./db";
import { signInAsAdmin } from "./helpers";
import { adminUrl, hostUrl, siteUrl } from "./hosts";

// Phase 14: the platform branding set in the admin panel reaches the home page, panels and client sites.
// The setting is shared, so the original value is restored afterwards.
let original: object | undefined;

test.beforeAll(async () => {
  original = (await sql<{ value: object }>(`SELECT value FROM "Setting" WHERE key = 'platformBranding'`))[0]
    ?.value;
});

test.afterAll(async () => {
  if (original) await sql(`UPDATE "Setting" SET value = $1 WHERE key = 'platformBranding'`, [original]);
  else await sql(`DELETE FROM "Setting" WHERE key = 'platformBranding'`);
});

test("the admin brands the platform: name, logo, colours, contact and home page text", async ({ page }) => {
  const owner = await createBillingUser();
  const { slug } = await createPublishedSite(owner, [
    { type: "Text", props: { id: "t", heading: "Strona", text: "", align: "left" } },
  ]);
  await page.goto(siteUrl(slug));
  await expect(page.getByTestId("site-branding")).toBeVisible();

  await signInAsAdmin(page);
  await page.goto(adminUrl("/branding"));
  // Filling before hydration races React restoring the server values.
  await page.waitForLoadState("networkidle");

  const identity = page.getByTestId("brand-identity-form");
  await identity.getByLabel("Nazwa serwisu").fill("Marka E2E");
  await page.getByTestId("brand-logo-input").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 400, height: 100, channels: 4, background: "#0f766e" } })
      .png()
      .toBuffer(),
  });
  // The hidden field carries the URL of the newly uploaded logo.
  await expect(identity.locator('input[name="logoUrl"]')).toHaveValue(/\/platform\/logo-/, {
    timeout: 15_000,
  });
  await identity.getByRole("button", { name: "Zapisz" }).click();
  await expect(identity.getByText("Zapisano.")).toBeVisible();

  const colors = page.getByTestId("brand-colors-form");
  await colors.locator("#brand-primaryColor").fill("#0f766e");
  await colors.locator("#brand-accentColor").fill("#fde68a");
  await expect(colors.getByText("Akcent jest bardzo jasny")).toBeVisible();
  await colors.getByRole("button", { name: "Zapisz" }).click();
  await expect(colors.getByText("Zapisano.")).toBeVisible();

  const contact = page.getByTestId("brand-contact-form");
  await contact.getByLabel("E-mail kontaktowy").fill("kontakt@marka-e2e.pl");
  await contact.getByRole("button", { name: "Zapisz" }).click();
  await expect(contact.getByText("Zapisano.")).toBeVisible();

  await page.getByText("Teksty strony głównej (PL)").click();
  const landing = page.getByTestId("landing-texts-pl");
  // A text no other spec reads (specs run in parallel against the same database).
  await landing.locator('textarea[name="text:marketing.hero.note"]').fill("Notka E2E pod przyciskami");
  await landing.getByRole("button", { name: "Zapisz" }).click();
  await expect(landing.getByText("Zapisano.")).toBeVisible();

  // Home page: logo, title, colours and contact.
  await page.goto(hostUrl(null, "/"));
  await expect(page.getByText("Notka E2E pod przyciskami")).toBeVisible();
  await expect(page.getByTestId("brand-mark").locator("img")).toHaveAttribute("alt", "Marka E2E");
  await expect(page).toHaveTitle(/^Marka E2E — /);
  await expect(page.getByTestId("contact-links")).toContainText("kontakt@marka-e2e.pl");
  const button = page.getByRole("link", { name: "Załóż konto" });
  expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(15, 118, 110)");

  // A client site rendered before the rename shows the new name (its ISR page is refreshed).
  await page.goto(siteUrl(slug));
  await expect(page.getByTestId("site-branding")).toContainText("Marka E2E");
});
