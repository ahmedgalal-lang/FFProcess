import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/** The Export Report picker starts with nothing ticked and offers Select all. Read-only. */
test.describe("export picker selection", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/workspaces/workspace-acme/export");
  });

  test("starts with no process ticked, and can't preview an empty pack", async ({ page }) => {
    const rows = page.locator('input[name="ids"]');
    const total = await rows.count();
    expect(total).toBeGreaterThan(1);
    for (let i = 0; i < total; i++) await expect(rows.nth(i)).not.toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: `0 of ${total} selected` })).toBeVisible();
    await expect(page.getByRole("button", { name: /Preview report/i })).toBeDisabled();
  });

  test("Select all ticks every process, and unticking one leaves the rest", async ({ page }) => {
    const rows = page.locator('input[name="ids"]');
    const total = await rows.count();
    const all = page.getByRole("checkbox", { name: "Select all processes" });

    await all.check();
    for (let i = 0; i < total; i++) await expect(rows.nth(i)).toBeChecked();
    await expect(page.getByRole("button", { name: /Preview report/i })).toBeEnabled();

    await rows.first().uncheck();
    await expect(all).not.toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: `${total - 1} of ${total} selected` })).toBeVisible();

    await all.check();
    await all.uncheck();
    await expect(page.getByRole("status").filter({ hasText: `0 of ${total} selected` })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("previews only the processes that were ticked", async ({ page }) => {
    await page.locator('input[name="ids"]').first().check();
    await page.getByRole("button", { name: /Preview report/i }).click();
    await page.waitForURL("**/reports/**");
    expect(new URL(page.url()).searchParams.getAll("ids")).toHaveLength(1);
  });
});
