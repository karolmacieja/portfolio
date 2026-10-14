import { expect, test, type Page } from "@playwright/test";

// Seeded by prisma/seed.ts.
const PASSWORD = process.env.SEED_PASSWORD || "Password123!";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").first().fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
}

test("client signs in, sees the dashboard and signs out", async ({ page }) => {
  await signIn(page, "client@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-title")).toHaveText("Witaj, Jan Kowalski!");

  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("wrong password shows an error", async ({ page }) => {
  await signIn(page, "client@example.com", "wrong-password-1");
  await expect(page.getByTestId("form-error")).toHaveText("Nieprawidłowy e-mail lub hasło.");
});

test("protected pages redirect to login and back after signing in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  await page.getByLabel("Adres e-mail").first().fill("client@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("magic link request leads to the check-email page", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Adres e-mail").fill("client@example.com");
  await page.getByRole("button", { name: "Wyślij link do logowania" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/, { timeout: 15_000 });
  await expect(page.getByText("Sprawdź skrzynkę")).toBeVisible();
});

test("client cannot open the admin panel", async ({ page }) => {
  await signIn(page, "client@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("admin can open the admin panel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/callbackUrl=%2Fadmin/);
  await page.getByLabel("Adres e-mail").first().fill("admin@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByTestId("admin-title")).toBeVisible();
});

test("new user registers and lands on the dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Imię i nazwisko").fill("Anna Nowak");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło").fill("bezpieczne-haslo-1");
  await page.getByRole("button", { name: "Załóż konto" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-title")).toHaveText("Witaj, Anna Nowak!");
  await expect(page.getByText("Twój adres e-mail nie jest jeszcze potwierdzony")).toBeVisible();
});

test("registration rejects a weak password", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Imię i nazwisko").fill("Anna Nowak");
  await page.getByLabel("Adres e-mail").fill("weak@example.com");
  await page.getByLabel("Hasło").fill("short1");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByText("Hasło musi mieć co najmniej 10 znaków.")).toBeVisible();
});
