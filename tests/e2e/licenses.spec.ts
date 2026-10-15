import { expect, test } from "@playwright/test";

import { createBillingUser, createPublishedSite } from "./db";
import { signInAsAdmin, signInAsClient } from "./helpers";
import { adminUrl, appUrl, siteUrl } from "./hosts";

const textBlock = { type: "Text", props: { id: "text-1", text: "Moje portfolio" } };

test("a manager buys a license, a member joins by link, sees the sponsor footer and pays to remove it", async ({
  page,
  browser,
}) => {
  const managerEmail = await createBillingUser({ profile: true });
  await signInAsClient(page, managerEmail);
  await page.goto(appUrl("/licenses"));
  const form = page.getByTestId("license-purchase-form");
  await form.getByLabel("Nazwa organizacji").fill("E2E Szkoła Fotografii");
  await form.getByLabel("Plan").selectOption({ label: "Pro" });
  await form.getByLabel("Liczba miejsc").fill("3");
  await form.getByLabel("Nazwa sponsora w stopce (opcjonalnie)").fill("Fundacja Obiektyw");
  await expect(form.getByTestId("license-total")).toContainText("87,00");
  await form.getByRole("button", { name: "Przejdź do płatności" }).click();
  await page.getByTestId("mock-checkout").getByRole("button", { name: "Zapłać" }).click();

  await expect(page.getByTestId("organization-name")).toHaveText("E2E Szkoła Fotografii");
  await expect(page.getByTestId("license-status")).toHaveText("Aktywna");
  await expect(page.getByTestId("seats-used")).toHaveText("Zajęte miejsca: 1 z 3");
  const joinLink = await page.getByTestId("join-link").inputValue();

  const memberEmail = await createBillingUser({ profile: true });
  const { slug } = await createPublishedSite(memberEmail, [textBlock]);
  const member = await browser.newPage();
  await signInAsClient(member, memberEmail);
  await member.goto(joinLink);
  await member
    .getByTestId("join-form")
    .getByRole("button", { name: "Dołącz do E2E Szkoła Fotografii" })
    .click();
  await expect(member.getByTestId("organization-name")).toHaveText("E2E Szkoła Fotografii");
  await member.goto(appUrl("/dashboard"));
  await expect(member.getByTestId("plan-name")).toHaveText("Pro");
  await expect(member.getByTestId("plan-from-license")).toBeVisible();

  await member.goto(siteUrl(slug));
  await expect(member.getByTestId("site-sponsor")).toHaveText("Strona wspierana przez Fundacja Obiektyw");

  await member.goto(appUrl("/organization"));
  await member
    .getByTestId("sponsor-offer")
    .getByRole("button", { name: /Usuń stopkę za 9,00/ })
    .click();
  await member.getByTestId("mock-checkout").getByRole("button", { name: "Zapłać" }).click();
  await expect(member.getByTestId("sponsor-removed")).toBeVisible();
  await member.goto(siteUrl(slug));
  await expect(member.getByTestId("site-sponsor")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("members")).toContainText(memberEmail);
});

test("staff create a manual license and hide the sponsor footer for one member", async ({ page }) => {
  const managerEmail = await createBillingUser();
  await signInAsAdmin(page);
  await page.goto(adminUrl("/licenses"));
  const form = page.getByTestId("manual-license-form");
  await form.getByLabel("E-mail opiekuna").fill(managerEmail);
  await form.getByLabel("Organizacja").fill("E2E Uczelnia");
  await form.getByLabel("Plan").selectOption({ label: "Business" });
  await form.getByLabel("Miejsca").fill("50");
  await form.getByLabel("Sponsor w stopce").fill("Uczelnia Testowa");
  await form.getByRole("button", { name: "Utwórz licencję" }).click();

  await expect(page.getByTestId("admin-license-name")).toHaveText("E2E Uczelnia");
  const row = page.getByTestId(`license-member-${managerEmail}`);
  await row.getByRole("button", { name: "Ukryj stopkę" }).click();
  await expect(row.getByRole("button", { name: "Pokaż stopkę" })).toBeVisible();
});
