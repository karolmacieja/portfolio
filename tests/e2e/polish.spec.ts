import { expect, test } from "@playwright/test";

import { createBillingUser, createPasswordResetLink, createPublishedSite } from "./db";
import { resetSignInIpLimit, signInAsClient } from "./helpers";
import { appUrl, hostUrl, siteUrl } from "./hosts";

const contactForm = {
  type: "ContactForm",
  props: { id: "contact-1", heading: "Napisz do mnie", description: "", submitLabel: "" },
};

test("landing, pricing and legal pages on the root domain", async ({ page }) => {
  await page.goto(hostUrl(null, "/"));
  await expect(page.getByTestId("home-title")).toBeVisible();
  await expect(page.getByTestId("pricing-pro")).toContainText("39");
  await page.getByRole("navigation", { name: "Informacje" }).getByRole("link", { name: "Regulamin" }).click();
  await expect(page.getByRole("heading", { name: "Regulamin", level: 1 })).toBeVisible();
  await expect(page.getByTestId("legal-text")).toContainText("Postanowienia ogólne");
  await page.goto(hostUrl(null, "/cennik?interval=year"));
  await expect(page.getByTestId("pricing-business")).toContainText("rok");
  await page.getByText("Jak zrezygnować?").click();
  await expect(page.getByText("Subskrypcję anulujesz w panelu")).toBeVisible();
});

test("a visitor sends a contact message; the owner reads it, sees visit stats and exports CSV", async ({
  page,
  browser,
}) => {
  const email = await createBillingUser({ plan: "business" });
  const { siteId, slug } = await createPublishedSite(email, [contactForm]);

  const visitor = await browser.newPage();
  await visitor.goto(siteUrl(slug));
  await expect(visitor.getByTestId("stats-beacon")).toHaveCount(1);
  const form = visitor.getByTestId("contact-form");
  await form.getByLabel("Imię i nazwisko").fill("Ewa Klientka");
  await form.getByLabel("E-mail").fill("ewa@example.com");
  await form.getByLabel("Wiadomość").fill("Dzień dobry, chciałabym zamówić sesję zdjęciową.");
  await form.getByRole("button", { name: "Wyślij" }).click();
  await expect(visitor).toHaveURL(/#contact-sent$/);
  await expect(visitor.getByText("Dziękujemy! Wiadomość została wysłana.")).toBeVisible();
  await expect(visitor.getByText("Nie udało się wysłać wiadomości")).toBeHidden();

  await signInAsClient(page, email);
  await expect(page.getByTestId("nav-messages")).toHaveText("Wiadomości (1)");
  await page.getByTestId("nav-messages").click();
  const messages = page.getByTestId("messages");
  await expect(messages).toContainText("Ewa Klientka");
  await expect(messages).toContainText("chciałabym zamówić sesję");
  await messages.getByRole("button", { name: "Oznacz jako przeczytaną" }).click();
  await expect(messages.getByRole("button", { name: "Oznacz jako nieprzeczytaną" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByTestId("messages-export").click();
  expect((await download).suggestedFilename()).toMatch(/^wiadomosci-.*\.csv$/);

  await page.goto(appUrl(`/sites/${siteId}/stats`));
  await expect(page.getByTestId("stats-views")).not.toHaveText("0");
  await expect(page.getByTestId("stats-pages")).toContainText("/");
});

test("plans without analytics see an upgrade prompt instead of statistics", async ({ page }) => {
  const email = await createBillingUser({ plan: "start" });
  const { siteId } = await createPublishedSite(email, [contactForm]);
  await signInAsClient(page, email);
  await page.goto(appUrl(`/sites/${siteId}/stats`));
  await expect(page.getByTestId("stats-locked")).toBeVisible();
});

test("registration with terms, onboarding, account export and a cancellable deletion", async ({ page }) => {
  await resetSignInIpLimit();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Imię i nazwisko").fill("Ola Nowa");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło").fill("bezpieczne-haslo-1");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByText("Zaakceptuj regulamin, aby założyć konto.")).toBeVisible();
  await page.getByLabel("Hasło").fill("bezpieczne-haslo-1");
  await page.getByTestId("terms-checkbox").check();
  await page.getByRole("button", { name: "Załóż konto" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("onboarding")).toContainText("Wybierz szablon");
  await expect(page.getByTestId("terms-update")).toHaveCount(0);

  await page.getByRole("link", { name: "Konto" }).click();
  const profile = page.getByTestId("profile-form");
  await profile.getByLabel("Imię i nazwisko").fill("Ola Zmieniona");
  await profile.getByRole("button", { name: "Zapisz" }).click();
  await expect(profile.getByText("Zapisano.")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByTestId("export-link").click();
  expect((await download).suggestedFilename()).toMatch(/^dane-konta-.*\.json$/);

  const deletion = page.getByTestId("delete-account-form");
  await deletion.getByLabel("Wpisz swój adres e-mail, aby potwierdzić").fill(email);
  await deletion.getByLabel("Obecne hasło").fill("bezpieczne-haslo-1");
  page.once("dialog", (dialog) => dialog.accept());
  await deletion.getByRole("button", { name: "Usuń konto" }).click();
  await expect(page.getByTestId("deletion-scheduled")).toBeVisible();
  await page.getByRole("button", { name: "Anuluj usunięcie" }).click();
  await expect(page.getByTestId("deletion-scheduled")).toHaveCount(0);
});

test("password reset: request, set a new password and sign in", async ({ page }) => {
  const email = await createBillingUser();
  await page.goto("/login");
  await page.getByRole("link", { name: "Nie pamiętasz hasła?" }).click();
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByRole("button", { name: "Wyślij link" }).click();
  await expect(page.getByTestId("reset-sent")).toBeVisible();

  await page.goto(await createPasswordResetLink(email));
  await page.getByLabel("Nowe hasło").fill("NoweHaslo2026");
  await page.getByRole("button", { name: "Ustaw hasło" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/reset-password?token=nieprawidlowy-token-123");
  await expect(page.getByText("Link do zmiany hasła jest nieprawidłowy lub wygasł.")).toBeVisible();
});
