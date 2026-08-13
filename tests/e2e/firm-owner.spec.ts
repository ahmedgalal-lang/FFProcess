import { test, expect } from "@playwright/test";

// NOTE: runs against the same dev database seeded by `pnpm db:seed` (see
// prisma/seed.ts), same pragmatic choice as core-workflows.spec.ts.

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/workspaces");
}

test.describe("Firm Owner management", () => {
  test("a non-owner cannot see or reach Firm Settings, and a Firm Owner can promote/demote", async ({ page, context }) => {
    // Sam starts as a plain Workspace member with no Firm role at all.
    const samPage = await context.newPage();
    await loginAs(samPage, "sam.osei@acme-example.com", "password123");
    await expect(samPage.getByRole("link", { name: "Firm Settings" })).toHaveCount(0);
    const directNav = await samPage.goto("/firm/settings");
    expect(directNav?.status()).toBe(404);

    // The Firm Owner promotes Sam to Owner.
    await loginAs(page, "ahmed.galal@forefront.consulting", "password123");
    await expect(page.getByRole("link", { name: "Firm Settings" })).toBeVisible();
    await page.goto("/firm/settings");
    await expect(page.locator("h1")).toHaveText("Firm Settings");

    // Sam may already have a Firm Member row from a previous run (promote/demote leaves one
    // behind — see below) or none at all (fresh seed). Handle both starting states.
    const samRow = page.locator("tr", { hasText: "Sam Osei" });
    if (await samRow.count()) {
      await samRow.locator('button:has-text("Promote to Owner")').click();
    } else {
      await page.selectOption("select", { label: "Sam Osei (sam.osei@acme-example.com)" });
      await page.click('button:has-text("Make Firm Owner")');
    }
    await expect(samRow).toContainText("Firm Owner");

    // With two owners, either can be demoted.
    const ahmedRow = page.locator("tr", { hasText: "Ahmed Galal" });
    await expect(ahmedRow.locator('button:has-text("Demote to Member")')).toBeEnabled();

    // Sam, now promoted, can reach the page himself.
    await samPage.reload();
    await expect(samPage.getByRole("link", { name: "Firm Settings" })).toBeVisible();
    await samPage.goto("/firm/settings");
    await expect(samPage.locator("h1")).toHaveText("Firm Settings");

    // Demote Sam back to Member — exercises the LAST_OWNER guard below and leaves a stable,
    // idempotent state for re-runs (a Firm Member row for Sam, not the pristine no-row seed state).
    await page.reload();
    await page.locator("tr", { hasText: "Sam Osei" }).locator('button:has-text("Demote to Member")').click();
    await expect(page.locator("tr", { hasText: "Sam Osei" })).toContainText("Firm Member");

    // Ahmed is now the sole owner — his own demote button must be disabled (FR-026).
    await page.reload();
    await expect(page.locator("tr", { hasText: "Ahmed Galal" }).locator('button:has-text("Demote to Member")')).toBeDisabled();
  });

  test("a Firm Owner can create and delete a client Workspace; a non-owner cannot", async ({ page, context }) => {
    await loginAs(page, "ahmed.galal@forefront.consulting", "password123");

    const name = `E2E Client ${Date.now()}`;
    await page.click('button:has-text("+ New Client")');
    await page.fill('input[placeholder="e.g. Acme Industrial"]', name);
    await page.click('button:has-text("Create")');

    const card = page.locator("a", { hasText: name });
    await expect(card).toBeVisible();

    // Deletion is gated behind retyping the exact name.
    await card.locator(`button[aria-label="Delete ${name}"]`).click();
    const deleteBtn = page.locator('button:has-text("Delete permanently")');
    await expect(deleteBtn).toBeDisabled();
    await page.fill('label:has-text("Type") input', "wrong name");
    await expect(deleteBtn).toBeDisabled();
    await page.fill('label:has-text("Type") input', name);
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();
    await expect(card).toHaveCount(0);

    // A non-owner sees neither affordance.
    const samPage = await context.newPage();
    await loginAs(samPage, "sam.osei@acme-example.com", "password123");
    await expect(samPage.locator('button:has-text("+ New Client")')).toHaveCount(0);
    await expect(samPage.locator('button[aria-label^="Delete"]')).toHaveCount(0);
  });
});
