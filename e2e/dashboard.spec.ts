import { test, expect } from "@playwright/test";

// Golden path: dashboard overview renders key KPI cards
test.describe("Dashboard overview", () => {
  test("shows KPI cards on the overview page", async ({ page }) => {
    await page.goto("/");
    // Wait for the page to hydrate
    await expect(page.getByRole("heading", { name: /dispositivos|online/i })).toBeVisible({ timeout: 10_000 });
  });

  test("navigation sidebar links are visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /dispositivos/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /links/i })).toBeVisible();
  });
});

// Golden path: device list renders
test.describe("Devices page", () => {
  test("navigates to devices and shows table", async ({ page }) => {
    await page.goto("/devices");
    // Either shows devices or an empty state
    await expect(
      page.getByRole("table").or(page.getByText(/nenhum dispositivo/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Golden path: notes page renders
test.describe("Notes page", () => {
  test("navigates to notes and renders", async ({ page }) => {
    await page.goto("/notes");
    // Page should load without error
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });
  });
});

// Auth: redirects unauthenticated users
test.describe("Authentication guard", () => {
  test("redirects to login when not authenticated", async ({ browser }) => {
    // Open a fresh context with no stored session
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/devices");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
    await ctx.close();
  });
});
