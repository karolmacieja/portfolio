import { expect, test, type Page } from "@playwright/test";

import { createBillingUser, createPremiumTemplate } from "./db";
import { createSiteAndOpen, signInAsClient } from "./helpers";
import { adminUrl, PASSWORD } from "./hosts";

/** Buys a plan through the mock checkout (plans page -> checkout -> success). */
async function buyPlan(page: Page, plan: string, coupon?: string) {
  await page.goto("/plans");
  const card = page.getByTestId(`plan-${plan}`);
  if (coupon) await card.getByLabel("Kod rabatowy").fill(coupon);
  await card.getByRole("button", { name: "Wybierz", exact: true }).click();
  await expect(page.getByTestId("mock-checkout")).toBeVisible({ timeout: 15_000 });
  if (coupon) await expect(page.getByText(`Kod rabatowy: ${coupon}`)).toBeVisible();
  await page.getByRole("button", { name: "Zapłać (test)" }).click();
  await expect(page.getByTestId("billing-success-status")).toContainText("Twój plan jest aktywny");
}

test("a client without a plan fills the billing profile, pays and can publish", async ({ page }) => {
  await signInAsClient(page, await createBillingUser());
  await page.goto("/plans");
  await expect(page.getByTestId("plan-start").getByRole("button", { name: "Wybierz" })).toBeDisabled();

  await page.getByRole("link", { name: "Edytuj dane do faktury" }).click();
  const form = page.getByTestId("billing-profile-form");
  await form.getByLabel("Ulica i numer").fill("Testowa 1");
  await form.getByLabel("Kod pocztowy").fill("00-001");
  await form.getByLabel("Miejscowość").fill("Warszawa");
  await form.getByRole("button", { name: "Zapisz dane" }).click();
  await expect(page).toHaveURL(/\/plans$/);

  await buyPlan(page, "start");
  await page.goto("/billing");
  await expect(page.getByTestId("billing-plan")).toHaveText("Start");
  await expect(page.getByTestId("billing-status")).toHaveText("Okres próbny");

  await page.goto("/dashboard");
  await createSiteAndOpen(page, "Po zakupie E2E");
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();
});

test("failed renewal shows the past-due alert; a successful one clears it", async ({ page }) => {
  await signInAsClient(page, await createBillingUser({ profile: true }));
  await buyPlan(page, "start");

  await page.goto("/billing");
  await page.getByRole("button", { name: "Zarządzaj płatnościami" }).click();
  await expect(page.getByTestId("mock-portal")).toBeVisible();
  await page.getByRole("button", { name: "Symuluj nieudaną płatność" }).click();
  await expect(page.getByText("Gotowe.")).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByTestId("past-due-alert")).toBeVisible();
  await expect(page.getByTestId("billing-status")).toHaveText("Zaległa płatność");

  await page.goto("/billing/mock-portal");
  await page.getByRole("button", { name: "Symuluj udane odnowienie" }).click();
  await expect(page.getByText("Gotowe.")).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByTestId("past-due-alert")).toHaveCount(0);
  await expect(page.getByTestId("billing-status")).toHaveText("Aktywna");
  await expect(page.getByTestId("payments").getByText("Opłacona")).toBeVisible();
});

test("switching plan, cancelling and resuming", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signInAsClient(page, await createBillingUser({ profile: true }));
  await buyPlan(page, "start");

  await page.goto("/plans");
  await page.getByTestId("plan-pro").getByRole("button", { name: "Przejdź na ten plan" }).click();
  await expect(page.getByTestId("plan-pro").getByText("Aktualny")).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByTestId("billing-plan")).toHaveText("Pro");
  await page.getByRole("button", { name: "Anuluj na koniec okresu" }).click();
  await expect(page.getByText(/Subskrypcja wygaśnie/)).toBeVisible();
  await page.getByRole("button", { name: "Wznów subskrypcję" }).click();
  await expect(page.getByText(/Okres próbny do/)).toBeVisible();
});

test("admin creates a coupon that a client applies at checkout", async ({ page, browser }) => {
  const code = `E2E${Date.now().toString(36).toUpperCase()}`;
  await page.goto(adminUrl("/login"));
  await page.getByLabel("Adres e-mail").first().fill("admin@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByTestId("admin-title")).toBeVisible();
  await page.goto(adminUrl("/coupons"));
  const form = page.getByTestId("create-coupon-form");
  await form.getByLabel("Kod").fill(code);
  await form.getByLabel("Nazwa").fill("Kupon E2E");
  await form.getByLabel("Rabat %").fill("20");
  await form.getByRole("button", { name: "Utwórz kupon" }).click();
  await expect(page.getByText("Kupon utworzony.")).toBeVisible();
  await expect(page.getByTestId(`coupon-${code}`)).toContainText("20%");

  const client = await browser.newPage();
  await signInAsClient(client, await createBillingUser({ profile: true }));
  await client.goto("/plans");
  const card = client.getByTestId("plan-start");
  await card.getByLabel("Kod rabatowy").fill("NIEMA-TAKIEGO");
  await card.getByRole("button", { name: "Wybierz", exact: true }).click();
  await expect(card.getByText("Kod rabatowy jest nieprawidłowy lub wygasł.")).toBeVisible();
  await buyPlan(client, "start", code);

  await page.reload();
  await expect(page.getByTestId(`coupon-${code}`).getByRole("cell").nth(4)).toHaveText("1");
});

test("a premium template is bought once and becomes usable", async ({ page }) => {
  const slug = await createPremiumTemplate(4900);
  await signInAsClient(page, await createBillingUser({ profile: true }));
  await page.goto("/templates");
  const card = page.getByTestId(`template-${slug}`);
  await card.getByRole("button", { name: /Kup za 49,00/ }).click();
  await expect(page.getByTestId("mock-checkout")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Zapłać (test)" }).click();
  await expect(page.getByTestId("template-purchased")).toBeVisible();
  await expect(card.getByRole("link", { name: "Użyj szablonu" })).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByTestId("payments").getByText("Premium E2E")).toBeVisible();
});
