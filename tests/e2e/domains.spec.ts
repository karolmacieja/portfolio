import { expect, test } from "@playwright/test";

import { createBillingUser } from "./db";
import { createSiteAndOpen, signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, hostUrl, siteUrl } from "./hosts";

// HOSTNAME_PROVIDER=mock: a connected domain becomes active on the next check. Locally, multi-label
// *.localhost hostnames act as client domains (Chromium resolves them to loopback).

test("plans without custom domains see an upgrade prompt", async ({ page }) => {
  await signInAsClient(page, await createBillingUser({ plan: "start" }));
  await createSiteAndOpen(page, "Bez domeny E2E");
  await page.getByRole("link", { name: "Domeny" }).click();
  await expect(page.getByText("Własna domena jest dostępna w planach Pro i Business.")).toBeVisible();
  await expect(page.getByText("Zakup domeny jest dostępny w planie Business.")).toBeVisible();
});

test("a connected domain goes live, becomes the main address and the subdomain redirects to it", async ({
  page,
}) => {
  await signInAsClient(page, await createBillingUser({ plan: "pro" }));
  const slug = await createSiteAndOpen(page, "Domena E2E");
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Strona została opublikowana.")).toBeVisible();

  const domain = `${slug}.pl.localhost`;
  await page.getByRole("link", { name: "Domeny" }).click();
  const form = page.getByTestId("add-domain-form");
  await form.getByLabel("Twoja domena").fill(domain);
  await form.getByRole("button", { name: "Podłącz domenę" }).click();

  const row = page.getByTestId(`domain-${domain}`);
  await expect(row.getByTestId("domain-status")).toHaveText("Czeka na DNS");
  await expect(row.getByTestId("dns-records").first()).toContainText("CNAME");
  await row.getByRole("button", { name: "Sprawdź teraz" }).click();
  await expect(row.getByTestId("domain-status")).toHaveText("Aktywna");
  await expect(page.getByTestId("main-address")).toContainText(domain);

  // hostUrl("{slug}.pl") = http://{slug}.pl.localhost:{port}/ — the connected domain.
  await page.goto(hostUrl(`${slug}.pl`));
  await expect(page.getByText("Witaj na mojej stronie portfolio.")).toBeVisible();
  await page.goto(siteUrl(slug));
  await expect(page).toHaveURL(new RegExp(`^http://${domain.replaceAll(".", "\\.")}:\\d+/$`));
});

test("a purchased domain is registered after payment and connected to the site", async ({ page }) => {
  await signInAsClient(page, await createBillingUser({ plan: "business", profile: true }));
  await createSiteAndOpen(page, "Zakup domeny E2E");
  await page.getByRole("link", { name: "Domeny" }).click();

  const name = `e2e-kup-${Date.now().toString(36)}`;
  await page.getByTestId("domain-search-form").getByRole("textbox").fill(name);
  await page.getByRole("button", { name: "Sprawdź dostępność" }).click();
  const offers = page.getByTestId("domain-offers");
  await expect(offers.getByRole("listitem")).toHaveCount(5);
  await offers
    .getByRole("listitem")
    .filter({ hasText: `${name}.pl` })
    .first()
    .getByRole("button", { name: "Wybierz" })
    .click();

  const registrant = page.getByTestId("registrant-form");
  await expect(registrant.getByLabel("Imię")).toHaveValue("Klient");
  await registrant.getByLabel("Telefon").fill("600100200");
  await registrant.getByRole("button", { name: /Zapłać .* i zarejestruj/ }).click();
  await expect(page.getByTestId("mock-checkout")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Zapłać (test)" }).click();
  await expect(page.getByTestId("domain-purchased")).toBeVisible();

  // The worker registers the domain and connects www to the site.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId(`order-${name}.pl`)).toContainText("Aktywna", { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId(`domain-www.${name}.pl`)).toBeVisible();

  const order = page.getByTestId(`order-${name}.pl`);
  await order.getByRole("button", { name: "Wyłącz automatyczne odnowienie" }).click();
  await expect(order).toContainText("nie odnawia się");
  await order.getByRole("button", { name: "Pokaż kod transferu" }).click();
  await expect(order.getByTestId("auth-code")).not.toBeEmpty();

  await signInAsAdmin(page);
  await page.goto(adminUrl(`/domains?q=${name}`));
  await expect(page.getByTestId("admin-domain-orders")).toContainText(`${name}.pl`);
  await expect(page.getByTestId("admin-domains")).toContainText(`www.${name}.pl`);
});
