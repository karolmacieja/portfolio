import { expect, test } from "@playwright/test";

import { signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, hostUrl } from "./hosts";

test("plan prices show the net profit live; highlights reach the pricing page", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(adminUrl("/plans"));
  await expect(page.getByTestId("cost-basis")).toContainText("VAT 23%");
  const profit = page.getByTestId("profit-pro-MONTH");
  await expect(profit).toContainText("zysk");
  const card = page.getByTestId("admin-plan-pro");
  await card.getByLabel("Cena miesięczna (zł brutto)").fill("1");
  await expect(profit).toHaveClass(/text-destructive/);

  const start = page.getByTestId("plan-form-start");
  await start.getByLabel(/Co w pakiecie/).fill("Pomoc E2E przy starcie");
  await start.getByRole("button", { name: "Zapisz" }).click();
  await expect(start.getByText("Zapisano.")).toBeVisible();
  await page.goto(hostUrl(null, "/cennik"));
  await expect(page.getByTestId("pricing-start")).toContainText("Pomoc E2E przy starcie");

  // Restore the seed plan.
  await page.goto(adminUrl("/plans"));
  await page
    .getByTestId("plan-form-start")
    .getByLabel(/Co w pakiecie/)
    .fill("");
  await page.getByTestId("plan-form-start").getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByTestId("plan-form-start").getByText("Zapisano.")).toBeVisible();
});

test("finance report, usage forecast and cost settings for the admin", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(adminUrl("/finance"));
  await expect(page.getByTestId("finance-mrr")).toBeVisible();
  await expect(page.getByTestId("chart-profit")).toBeVisible();
  await expect(page.getByTestId("finance-sources")).toContainText("Licencje grupowe");
  await expect(page.getByTestId("chart-forecast")).toBeVisible();

  await page.goto(adminUrl("/usage"));
  await expect(page.getByTestId("capacity-database")).toBeVisible();
  await expect(page.getByTestId("usage-clients")).not.toHaveText("0");
  await expect(page.getByTestId("chart-page-views")).toBeVisible();

  await page.goto(adminUrl("/settings"));
  const form = page.getByTestId("finance-settings-form");
  await form.getByLabel("Prowizja płatności (%)").fill("1,5");
  await form.getByRole("button", { name: "Zapisz" }).click();
  await expect(form.getByText("Zapisano.")).toBeVisible();
});

test("clients see their 30-day activity on the dashboard", async ({ page }) => {
  await signInAsClient(page);
  await expect(page.getByTestId("client-usage")).toBeVisible();
  await expect(page.getByTestId("client-usage-published")).toContainText("/");
});
