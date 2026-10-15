import "dotenv/config";

import { expect, type Page } from "@playwright/test";
import Redis from "ioredis";

import { adminUrl, PASSWORD } from "./hosts";

/**
 * Every E2E sign-in comes from 127.0.0.1, so the suite would exhaust the per-IP sign-in limit.
 * Clear that counter before signing in (the per-email limit and the limiter itself stay untouched).
 */
export async function resetSignInIpLimit() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const keys = await redis.keys("rl:signin:ip:*");
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}

export async function signInAsAdmin(page: Page) {
  await resetSignInIpLimit();
  await page.goto(adminUrl("/login"));
  await page.getByLabel("Adres e-mail").first().fill("admin@example.com");
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByTestId("admin-title")).toBeVisible();
}

export async function signInAsClient(page: Page, email = "client@example.com") {
  await resetSignInIpLimit();
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").first().fill(email);
  await page.getByLabel("Hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Creates a fresh site from the dashboard and opens its management page. Returns the slug. */
export async function createSiteAndOpen(page: Page, name: string): Promise<string> {
  const slug = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const form = page.getByTestId("create-site-form");
  await form.getByLabel("Nazwa strony").fill(name);
  await form.getByLabel("Adres strony").fill(slug);
  await form.getByRole("button", { name: "Utwórz stronę" }).click();
  const card = page.getByTestId(`site-${slug}`);
  await card.getByRole("link", { name: "Zarządzaj" }).click();
  await expect(page.getByTestId("site-title")).toHaveText(name);
  return slug;
}
