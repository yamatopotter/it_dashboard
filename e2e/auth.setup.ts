import { test as setup, expect } from "@playwright/test";
import path from "path";

export const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

// Authenticates once and saves session to disk.
// Other tests reuse this state via storageState in playwright.config.ts.
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/usuário|username/i).fill(process.env.E2E_USERNAME ?? "admin");
  await page.getByLabel(/senha|password/i).fill(process.env.E2E_PASSWORD ?? "admin");
  await page.getByRole("button", { name: /entrar|login/i }).click();

  // Wait for redirect to dashboard
  await expect(page).toHaveURL("/", { timeout: 10_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});
