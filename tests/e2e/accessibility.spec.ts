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

  test("Process Map Steps List edit form has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("Steps List")');
    await page.locator('button[aria-label^="Edit"]').first().click();

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
    await page.goto("/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/authority");
    await page.waitForSelector("text=Co-approval above");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Export Report picker has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Export Report preview has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export/preview?ids=7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8");
    await page.waitForSelector("text=Authority Matrix");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("AI Review page has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=AI Review");
    await page.waitForURL("**/review");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Firm Settings has no automatically detectable violations", async ({ page }) => {
    await page.goto("/firm/settings");
    await page.waitForSelector('h1:has-text("Firm Settings")');

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Workspace picker has no automatically detectable violations", async ({ page }) => {
    await page.waitForSelector("h1");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Workspace picker's New Client form and delete-confirmation dialog have no violations", async ({ page }) => {
    await page.waitForSelector("h1");
    await page.click('button:has-text("+ New Client")');
    let results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);

    const name = `AxeTest ${Date.now()}`;
    await page.fill('input[placeholder="e.g. Acme Industrial"]', name);
    await page.click('button:has-text("Create")');
    const card = page.locator("a", { hasText: name });
    await card.locator(`button[aria-label="Delete ${name}"]`).click();
    await page.waitForSelector("text=Delete permanently");

    results = await new AxeBuilder({ page }).analyze(); // whole page — dialog is a fixed overlay outside <main>
    expect(results.violations).toEqual([]);

    await page.fill('label:has-text("Type") input', name);
    await page.click('button:has-text("Delete permanently")');
    await expect(card).toHaveCount(0);
  });

  test("Members page has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/members");
    await page.waitForSelector("h1");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Org Directory has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/org");
    await page.waitForSelector("h1");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Processes list has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.waitForSelector("h1");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Processes list search results and new-category form have no automatically detectable violations", async ({
    page,
  }) => {
    await page.goto("/workspaces/workspace-acme/processes?q=Purchase");
    await page.waitForSelector("h1");
    let results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);

    await page.goto("/workspaces/workspace-acme/processes");
    await page.click('button:has-text("+ New category")');
    results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Workspace dashboard, including the profile edit form, has no automatically detectable violations", async ({
    page,
  }) => {
    await page.goto("/workspaces/workspace-acme");
    await page.waitForSelector("h1");
    let results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);

    await page.click('button:has-text("Edit")');
    results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Org Chart page has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/org/chart");
    await page.waitForSelector(".react-flow__node");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Clone-process dialog has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.waitForSelector("h1");
    await page.locator('button:has-text("Clone")').first().click();
    await page.waitForSelector('[role="dialog"]');
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Generate-from-best-practice form has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.click('button:has-text("Generate from best practice")');
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Bulk-add-steps form has no automatically detectable violations", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("+ Add multiple steps at once")');

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
