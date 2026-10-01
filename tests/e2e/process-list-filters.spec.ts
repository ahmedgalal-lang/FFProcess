import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/** The column filters on the Processes list. Read-only: filters only hide rows in the page. */
test.describe("process list column filters", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/workspaces/workspace-acme/processes");
  });

  const rows = (page: import("@playwright/test").Page) => page.locator("tbody tr");

  test("filters by the values ticked in a column, and clears", async ({ page }) => {
    const total = await rows(page).count();
    expect(total).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Filter Code" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter Code" });
    await dialog.getByRole("checkbox", { name: "Select all" }).uncheck();
    await dialog.getByRole("checkbox", { name: "PUR100" }).check();

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("PUR100");
    await expect(page.getByRole("status").filter({ hasText: `Showing 1 of ${total} processes` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter Code (filtered)" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(rows(page)).toHaveCount(total);
  });

  test("filters combine, and a column's search narrows its own values", async ({ page }) => {
    await page.getByRole("button", { name: "Filter Code" }).click();
    const code = page.getByRole("dialog", { name: "Filter Code" });
    await code.getByRole("searchbox", { name: "Search Code values" }).fill("PUR");
    await code.getByRole("checkbox", { name: "Select all shown" }).uncheck();
    await code.getByRole("checkbox", { name: "PUR101" }).check();
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(1);

    // A second filter works on what the first left.
    await page.getByRole("button", { name: "Filter Steps" }).click();
    const steps = page.getByRole("dialog", { name: "Filter Steps" });
    await expect(steps.getByRole("checkbox")).toHaveCount(2); // Select all + the one value PUR101 has
  });

  test("Select all comes back to no filter", async ({ page }) => {
    const total = await rows(page).count();
    await page.getByRole("button", { name: "Filter RACI" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter RACI" });
    await dialog.getByRole("checkbox", { name: "Select all" }).uncheck();
    await expect(rows(page)).toHaveCount(1); // the "no rows match" line
    await expect(page.getByText("No processes match these filters.")).toBeVisible();
    await dialog.getByRole("checkbox", { name: "Select all" }).check();
    await expect(rows(page)).toHaveCount(total);
    await expect(page.getByRole("button", { name: "Filter RACI" })).toBeVisible(); // no longer marked filtered
  });
});
