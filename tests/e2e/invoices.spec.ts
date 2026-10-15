import { expect, test, type Page } from "@playwright/test";

import { createBillingUser, createPremiumTemplate, sql } from "./db";
import { signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl } from "./hosts";

// Invoices are issued by the worker (started by playwright.config.ts) a moment after the payment.

async function buyPremiumTemplate(page: Page) {
  const slug = await createPremiumTemplate(4900);
  await page.goto("/templates");
  await page
    .getByTestId(`template-${slug}`)
    .getByRole("button", { name: /Kup za 49,00/ })
    .click();
  await page.getByRole("button", { name: "Zapłać (test)" }).click();
  await expect(page.getByTestId("template-purchased")).toBeVisible();
}

/** Reloads /billing until the invoice of the given kind is listed. */
async function waitForInvoice(page: Page, kind: "INVOICE" | "CORRECTION") {
  await expect(async () => {
    await page.goto("/billing");
    await expect(page.getByTestId(`invoice-${kind}`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}

test("a payment produces an invoice PDF; a refund produces a correction", async ({ page }) => {
  await signInAsClient(page, await createBillingUser({ profile: true }));
  await buyPremiumTemplate(page);

  await waitForInvoice(page, "INVOICE");
  const invoice = page.getByTestId("invoice-INVOICE");
  await expect(invoice).toContainText(/FV\/\d+\/\d{2}\/\d{4}/);
  await expect(invoice).toContainText("49,00");
  const download = page.waitForEvent("download");
  await invoice.getByRole("link", { name: "Pobierz PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^FV-\d+-\d{2}-\d{4}\.pdf$/);

  await page.goto("/billing/mock-portal");
  await page.getByRole("button", { name: "Symuluj zwrot ostatniej płatności" }).click();
  await expect(page.getByText("Gotowe.")).toBeVisible();
  await waitForInvoice(page, "CORRECTION");
  await expect(page.getByTestId("invoice-CORRECTION")).toContainText("Korekta faktury FV/");
  await expect(page.getByTestId("payments")).toContainText("Zwrócona");
});

test("admin sees invoices needing manual review and edits invoicing settings", async ({ page, browser }) => {
  const client = await browser.newPage();
  const email = await createBillingUser({ profile: true, name: "Odrzucony [fail]" });
  await signInAsClient(client, email);
  await buyPremiumTemplate(client);

  await signInAsAdmin(page);

  await expect(async () => {
    await page.goto(adminUrl(`/invoices?status=FAILED&q=${encodeURIComponent(email)}`));
    await expect(page.getByTestId("admin-invoices")).toContainText(email, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  const row = page.getByTestId("admin-invoices").getByRole("row").filter({ hasText: email });
  await expect(row).toContainText("Do ręcznej weryfikacji");
  await expect(row).toContainText("rejected");

  // Fixing the client's billing data and retrying issues the invoice with the current data.
  await sql(
    `UPDATE "BillingProfile" SET "fullName" = 'Poprawiony Klient'
     WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
    [email],
  );
  await row.getByRole("button", { name: "Ponów" }).click();
  await expect(async () => {
    await page.goto(adminUrl(`/invoices?q=${encodeURIComponent(email)}`));
    await expect(page.getByTestId("admin-invoices")).toContainText("Wystawiona", { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  await page.goto(adminUrl("/settings"));
  const form = page.getByTestId("invoicing-settings-form");
  await expect(form.getByLabel("Stawka VAT sprzedaży")).toHaveValue("23");
  await form.getByLabel("Miejsce wystawienia").fill("Warszawa");
  await form.getByRole("button", { name: "Zapisz ustawienia" }).click();
  await expect(form.getByText("Zapisano.")).toBeVisible();
});
