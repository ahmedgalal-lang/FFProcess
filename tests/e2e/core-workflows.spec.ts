import { test, expect } from "@playwright/test";

// NOTE: runs against the same dev database seeded by `pnpm db:seed` (see
// prisma/seed.ts) rather than an isolated test database — a dedicated test DB
// is a follow-up (tasks.md T031/T039 assume "a seeded test database"; this is
// the pragmatic version discovered while building the MVP slice).

test.describe("Core workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]'); // seeded Firm Owner credentials are pre-filled
    await page.waitForURL("**/workspaces");
  });

  test("Firm Owner reaches Acme Industrial via the workspace picker", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("All Clients");
    await page.click("text=Acme Industrial");
    await page.waitForURL("**/workspaces/**");
    await expect(page.locator("h1")).toHaveText("Acme Industrial");
  });

  test("Process Map shows the seeded Purchase-to-Pay steps and cross-process links", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");

    await expect(page.locator("h1")).toContainText("Purchase-to-Pay");
    const steps = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5");
    await expect(steps).toHaveCount(9);
    await expect(page.locator("text=🔗 PUR102")).toBeVisible();
    await expect(page.locator("text=🔗 SAL101")).toBeVisible();
  });

  test("RACI matrix flags the seeded validation gap and blocks finalization", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");

    await expect(page.locator("text=validation issue")).toBeVisible();
    await expect(page.locator('button:has-text("Mark Final")')).toBeDisabled();
  });

  test("Authority query resolves the tightest rule, co-approval, and gap correctly", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/authority");
    await expect(page.locator("text=Who can approve this?")).toBeVisible();

    await page.click('button:has-text("$5,000")');
    await expect(page.locator("main")).toContainText("AP Clerk");

    await page.click('button:has-text("$60,000")');
    await expect(page.locator("main")).toContainText("Co-approval required from");
    await expect(page.locator("main")).toContainText("Controller");

    await page.click('button:has-text("$250,000")');
    await expect(page.locator("main")).toContainText("No authorized approver");
  });
});
