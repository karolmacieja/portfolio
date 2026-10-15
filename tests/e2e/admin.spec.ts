import { expect, test } from "@playwright/test";

import { createBillingUser } from "./db";
import { createSiteAndOpen, resetSignInIpLimit, signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, PASSWORD, siteUrl } from "./hosts";

test("dashboard, client card: note, manual plan, block — all audited", async ({ page }) => {
  const email = await createBillingUser({ profile: true });
  await signInAsAdmin(page);
  await expect(page.getByTestId("metric-mrr")).toBeVisible();
  await expect(page.getByTestId("chart-revenue")).toBeVisible();

  await page.goto(adminUrl(`/clients?q=${encodeURIComponent(email)}`));
  await page.getByTestId("admin-clients").getByRole("link", { name: email }).click();
  await expect(page.getByTestId("client-email")).toHaveText(email);

  await page.getByTestId("note-form").getByRole("textbox").fill("Dzwonił w sprawie domeny");
  await page.getByTestId("note-form").getByRole("button", { name: "Dodaj notatkę" }).click();
  await expect(page.getByTestId("client-notes")).toContainText("Dzwonił w sprawie domeny");

  const grant = page.getByTestId("grant-plan-form");
  await grant.getByLabel("Plan").selectOption({ label: "Pro" });
  await grant.getByRole("button", { name: "Przyznaj plan" }).click();
  await expect(page.getByTestId("client-plan")).toContainText("Pro");
  await expect(page.getByTestId("client-plan")).toContainText("przyznany ręcznie");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zablokuj konto" }).click();
  await expect(page.getByText(/Zablokowany od/)).toBeVisible();
  await page.getByRole("button", { name: "Odblokuj konto" }).click();
  await expect(page.getByText(/Zablokowany od/)).toHaveCount(0);

  await page.goto(adminUrl("/audit?action=client."));
  const log = page.getByTestId("audit-log");
  await expect(log).toContainText("client.plan.grant");
  await expect(log).toContainText("client.block");
  await expect(log).toContainText("admin@example.com");
});

test("impersonation: banner, payments blocked, ending returns to the admin panel", async ({ page }) => {
  const email = await createBillingUser({ profile: true });
  await signInAsAdmin(page);
  await page.goto(adminUrl(`/clients?q=${encodeURIComponent(email)}`));
  await page.getByTestId("admin-clients").getByRole("link", { name: email }).click();

  const form = page.getByTestId("impersonate-form");
  await form.getByRole("textbox").fill("Zgłoszenie #42");
  await form.getByRole("button", { name: "Zaloguj jako klient" }).click();
  await expect(page.getByText(`Zalogujesz się jako ${email}.`)).toBeVisible();
  await page.getByRole("button", { name: "Kontynuuj" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("impersonation-banner")).toContainText(email);
  await page.goto("/billing/profile");
  await page.getByTestId("billing-profile-form").getByRole("button", { name: "Zapisz dane" }).click();
  await expect(page.getByText("Płatności są niedostępne podczas logowania jako klient.")).toBeVisible();

  await page.getByTestId("impersonation-banner").getByRole("button", { name: "Zakończ" }).click();
  await expect(page).toHaveURL(/admin\.localhost:\d+\/clients$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("a content report leads to suspension with reasons; the site is restored afterwards", async ({
  page,
  browser,
}) => {
  const client = await browser.newPage();
  await signInAsClient(client, await createBillingUser({ plan: "pro" }));
  const slug = await createSiteAndOpen(client, "Moderacja E2E");
  await client.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(client.getByText("Strona została opublikowana.")).toBeVisible();

  // Anonymous visitor reports the site from its footer.
  const visitor = await browser.newPage();
  await visitor.goto(siteUrl(slug));
  await visitor.getByRole("link", { name: "Zgłoś treść" }).click();
  const report = visitor.getByTestId("report-form");
  await report.getByLabel("Rodzaj naruszenia").selectOption("COPYRIGHT");
  await report.getByLabel(/Opis/).fill("Zdjęcia skopiowane z mojego portfolio bez zgody.");
  await report.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(visitor.getByTestId("report-sent")).toBeVisible();

  await signInAsAdmin(page);
  await page.goto(adminUrl("/reports"));
  const item = page.getByTestId("reports").getByRole("listitem").filter({ hasText: slug });
  await item
    .getByPlaceholder("Uzasadnienie dla właściciela strony")
    .fill("Naruszenie praw autorskich do zdjęć.");
  await item.getByRole("button", { name: "Wstrzymaj stronę" }).click();
  await expect(page.getByTestId("reports").getByRole("listitem").filter({ hasText: slug })).toHaveCount(0);

  await visitor.goto(siteUrl(slug));
  await expect(visitor.getByTestId("site-suspended")).toBeVisible();
  await client.reload();
  await expect(client.getByTestId("moderation-notice")).toContainText("Naruszenie praw autorskich do zdjęć.");

  await page.goto(adminUrl(`/sites?q=${slug}`));
  const row = page.getByTestId(`admin-site-${slug}`);
  await row.getByRole("textbox").fill("Treści usunięte przez właściciela.");
  await row.getByRole("button", { name: "Przywróć" }).click();
  await expect(row.getByRole("button", { name: "Wstrzymaj" })).toBeVisible();
  await visitor.goto(siteUrl(slug));
  await expect(visitor.getByTestId("site-suspended")).toHaveCount(0);
});

test("SUPPORT handles clients but not settings, plans or the team", async ({ page }) => {
  await resetSignInIpLimit();
  await page.goto(adminUrl("/login"));
  await page.getByLabel("Adres e-mail").first().fill("support@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByTestId("admin-title")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Menu administracyjne" });
  await expect(nav.getByRole("button", { name: "Analizy" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Obsługa" }).click();
  await nav.getByRole("link", { name: "Klienci" }).click();
  await expect(page.getByTestId("admin-clients")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Klienci" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Sprzedaż" }).click();
  await expect(nav.getByRole("link", { name: "Faktury" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Plany" })).toHaveCount(0);
  // Only the audit log is left of "System" for SUPPORT, so it is a plain link.
  await expect(nav.getByRole("button", { name: "System" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Audit log" }).click();
  await expect(nav.getByRole("link", { name: "Faktury" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Ustawienia" })).toHaveCount(0);
  for (const path of ["/settings", "/plans", "/staff"]) {
    await page.goto(adminUrl(path));
    await expect(page).toHaveURL(/\/forbidden$/);
  }
  await page.goto(adminUrl("/clients"));
  await expect(page.getByTestId("admin-clients")).toBeVisible();
});

test("admin sees plans with block tiers and the team", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(adminUrl("/plans"));
  await expect(page.getByTestId("admin-plan-pro")).toBeVisible();
  await expect(page.getByTestId("block-tier-Hero")).toBeVisible();
  await page.goto(adminUrl("/staff"));
  await expect(page.getByTestId("staff")).toContainText("support@example.com");
});
