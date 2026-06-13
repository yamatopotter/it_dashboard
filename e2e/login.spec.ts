import { test, expect } from "@playwright/test";

// Run these without stored auth state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login page", () => {
  test("renders login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.getByLabel(/usuário|username/i)).toBeVisible();
    await expect(page.getByLabel(/senha|password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar|login/i })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/usuário|username/i).fill("invaliduser");
    await page.getByLabel(/senha|password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /entrar|login/i }).click();
    // Should stay on login page or show error
    await expect(page).toHaveURL(/login/, { timeout: 5_000 });
  });
});
