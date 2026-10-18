import { expect, test } from "@playwright/test";

import { createBillingUser } from "./db";
import { signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, appUrl } from "./hosts";

test("mail branding, preview and a test mail", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(adminUrl("/settings"));
  // Filling before hydration lets React restore the old value mid-fill (text gets appended).
  await page.waitForLoadState("networkidle");
  const form = page.getByTestId("mail-branding-form");
  const footer = form.getByLabel("Stopka maili");
  await footer.fill("Portfolio Sp. z o.o.\nul. Testowa 1, Warszawa");
  await expect(footer).toHaveValue("Portfolio Sp. z o.o.\nul. Testowa 1, Warszawa");
  await form.getByRole("button", { name: "Zapisz" }).click();
  await expect(form.getByText("Zapisano.")).toBeVisible();

  await page.goto(adminUrl("/mail-preview?kind=passwordReset&locale=pl"));
  await expect(page.getByTestId("preview-subject")).toContainText("Ustaw nowe hasło");
  await expect(
    page.frameLocator('[data-testid="mail-preview"]').getByText("ul. Testowa 1, Warszawa"),
  ).toBeVisible();
  await page.getByTestId("send-test-mail").getByRole("button").click();
  await expect(page.getByText("Wysłano mail testowy.")).toBeVisible();
});

test("a campaign is written, sent by the worker and reported", async ({ page }) => {
  const email = await createBillingUser();
  const client = await page.context().browser()!.newPage();
  await signInAsClient(client, email);
  await client.goto(appUrl("/account"));
  await client.getByTestId("newsletter-toggle").getByRole("button", { name: "Zapisz mnie" }).click();
  await expect(client.getByTestId("newsletter-status")).toHaveText("Zapisano Cię na newsletter.");

  await signInAsAdmin(page);
  await page.goto(adminUrl("/newsletter"));
  const form = page.getByTestId("campaign-form");
  await form.getByLabel("Temat").fill("E2E Nowe szablony");
  await form.getByLabel("Treść").fill("## Cześć {name}\n\nDodaliśmy nowe szablony portfolio.");
  await form.getByLabel("Odbiorcy").selectOption("noPlan");
  await form.getByRole("button", { name: "Utwórz szkic" }).click();

  await expect(page.getByTestId("campaign-status")).toHaveText("Szkic");
  await expect(page.getByTestId("audience-size")).not.toContainText("0 osób");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("send-now").getByRole("button", { name: "Wyślij teraz" }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("campaign-status")).toHaveText("Wysłana");
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("campaign-stats")).not.toContainText("wysłane: 0");
});

test("the unsubscribe page rejects a forged link", async ({ page }) => {
  await page.goto(appUrl("/unsubscribe?token=forged"));
  await page.getByTestId("unsubscribe-form").getByRole("button", { name: "Wypisz mnie" }).click();
  await expect(page.getByText("Link wypisania jest nieprawidłowy")).toBeVisible();
});
