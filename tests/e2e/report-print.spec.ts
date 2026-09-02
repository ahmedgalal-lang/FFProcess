import { test, expect } from "@playwright/test";

/**
 * Two print/PDF-specific defects reported live: the Org Chart's live zoom
 * controls (and PNG-export button) baked into the printed page — dead,
 * non-functional UI in a PDF — and a process with no content beyond its
 * title card still forcing a full, nearly-blank page for itself.
 */
test.describe("Export Report print layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workspaces");
  });

  test("Org Chart in the report has no live zoom controls or export button baked in", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    const orgSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Org Structure" }) });
    await expect(orgSection).toBeVisible();

    // The interactive OrgChartCanvas renders both of these; the static
    // report version must render neither — they're dead weight on a page
    // meant to be printed or saved as a PDF, not interacted with.
    await expect(orgSection.locator(".react-flow__controls")).toHaveCount(0);
    await expect(orgSection.getByRole("button", { name: /PNG/i })).toHaveCount(0);
  });

  test("A process with no content beyond its title doesn't force a page break after itself", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    // PUR100 is the seeded umbrella program: no steps, no RACI, no scope —
    // nothing beyond its own title card. Its section should be a plain
    // sibling in the flow rather than forcing the next process onto a fresh
    // page for nothing.
    const pur100Section = page
      .locator("main > section")
      .filter({ hasText: "Procure-to-Pay Program" })
      .filter({ hasText: "Umbrella program grouping procurement sub-processes" });
    await expect(pur100Section).toHaveCount(1);
    await expect(pur100Section).not.toHaveClass(/print-page/);

    // Purchase-to-Pay (PUR101) has real content and keeps its own page break.
    const pur101Section = page.locator("main > section").filter({ hasText: "1.0 Executive Summary" });
    await expect(pur101Section).toHaveClass(/print-page/);
  });
});
