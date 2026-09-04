import { test, expect } from "@playwright/test";

/**
 * Print/PDF-specific defects reported live: the Org Chart's live zoom
 * controls (and PNG-export button) baked into the printed page — dead,
 * non-functional UI in a PDF — and two processes' banners landing on the
 * same page (a content-less umbrella process sharing a page with the next
 * process's content read as one process bleeding into another).
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

  test("Every process starts on its own page, even one with no content beyond its title", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    // PUR100 is the seeded umbrella program: no steps, no RACI, no scope —
    // nothing beyond its own title card. It still gets a page break of its
    // own, so the next process's content never lands on the same page.
    const pur100Section = page
      .locator("main > section")
      .filter({ hasText: "Procure-to-Pay Program" })
      .filter({ hasText: "Umbrella program grouping procurement sub-processes" });
    await expect(pur100Section).toHaveCount(1);
    await expect(pur100Section).toHaveClass(/print-page/);

    // Purchase-to-Pay (PUR101) has real content and keeps its own page break too.
    const pur101Section = page.locator("main > section").filter({ hasText: "1.0 Executive Summary" });
    await expect(pur101Section).toHaveClass(/print-page/);
  });

  test("Spacing control retunes how much fits on a page, and never prints itself", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    // Everything in the report is sized in rem against a page fixed in
    // millimetres, so the root font size is the one knob that changes how much
    // lands on a page — in the preview and in the PDF the browser makes from it.
    const rootFontSize = () => page.evaluate(() => document.documentElement.style.fontSize);
    expect(await rootFontSize()).toBe("");

    await page.getByRole("button", { name: "Tight", exact: true }).click();
    await expect.poll(rootFontSize).toBe("85%");
    await expect(page.getByRole("button", { name: "Tight", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Roomy", exact: true }).click();
    await expect.poll(rootFontSize).toBe("108%");

    // Back to Default clears the override rather than pinning 100%, so the
    // document returns to whatever font size the reader's browser is set to.
    await page.getByRole("button", { name: "Default", exact: true }).click();
    await expect.poll(rootFontSize).toBe("");

    // The control is preview furniture, not part of the document: it sits in
    // the no-print toolbar, so it can't land in the printed pack.
    const toolbar = page.locator(".no-print").filter({ hasText: "Spacing" }).first();
    await expect(toolbar).toBeVisible();
  });
});
