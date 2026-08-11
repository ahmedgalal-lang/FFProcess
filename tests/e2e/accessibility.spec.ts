import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated a11y scan (tasks.md T058) across the three primary data surfaces:
// the Process Map canvas, the RACI grid, and the Authority Matrix. Runs axe-core's
// default ruleset (WCAG 2.0/2.1 A/AA) and fails on any violation.

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]'); // seeded Firm Owner credentials are pre-filled
    await page.waitForURL("**/workspaces");
  });

  test("Process Map (Diagram view) has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.waitForSelector(".react-flow__node");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Process Map (Steps List view) has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("Steps List")');

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("RACI matrix has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Authority matrix has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/authority");
    await page.waitForSelector("text=Who can approve this?");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("RACI grid supports arrow-key cell navigation", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");

    const grid = page.locator('table[role="grid"]');
    const firstCell = grid.locator('button[tabindex="0"]');
    await firstCell.focus();
    await expect(firstCell).toBeFocused();

    const firstLabel = await firstCell.getAttribute("aria-label");
    await page.keyboard.press("ArrowRight");

    // The newly-focused cell should be a different gridcell button than the first.
    const focused = page.locator(":focus");
    const focusedLabel = await focused.getAttribute("aria-label");
    expect(focusedLabel).not.toBe(firstLabel);
    await expect(focused).toHaveAttribute("tabindex", "0");
  });
});
