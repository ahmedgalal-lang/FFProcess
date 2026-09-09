import { test, expect } from "@playwright/test";
import { signIn, E2E_EDITOR, SEEDED_FIRM_OWNER } from "./sign-in";

// NOTE: runs against the same dev database seeded by `pnpm db:seed` (see
// prisma/seed.ts), same pragmatic choice as core-workflows.spec.ts.

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await signIn(page, { email, password });
}

test.describe("Firm Owner management", () => {
  test("a non-owner cannot see or reach Firm Settings, and a Firm Owner can promote/demote", async ({ page, context }) => {
    // The editor starts as a plain Workspace member with no Firm role at all.
    const editorPage = await context.newPage();
    await loginAs(editorPage, E2E_EDITOR.email, E2E_EDITOR.password);
    await expect(editorPage.getByRole("link", { name: "Firm Settings" })).toHaveCount(0);
    const directNav = await editorPage.goto("/firm/settings");
    expect(directNav?.status()).toBe(404);

    // The Firm Owner promotes them to Owner.
    await loginAs(page, SEEDED_FIRM_OWNER.email, SEEDED_FIRM_OWNER.password);
    await expect(page.getByRole("link", { name: "Firm Settings" })).toBeVisible();
    await page.goto("/firm/settings");
    await expect(page.locator("h1")).toHaveText("Firm Settings");

    // The fixture may already have a Firm Member row from a previous run
    // (promote/demote leaves one behind — see below) or none at all. Handle
    // both starting states.
    const editorRow = page.locator("tr", { hasText: E2E_EDITOR.name });
    if (await editorRow.count()) {
      await editorRow.locator('button:has-text("Promote to Owner")').click();
    } else {
      await page.selectOption("select", { label: `${E2E_EDITOR.name} (${E2E_EDITOR.email})` });
      await page.click('button:has-text("Make Firm Owner")');
    }
    await expect(editorRow).toContainText("Firm Owner");

    // With two owners, either can be demoted.
    const ahmedRow = page.locator("tr", { hasText: "Ahmed Galal" });
    await expect(ahmedRow.locator('button:has-text("Demote to Member")')).toBeEnabled();

    // Now promoted, they can reach the page themselves.
    await editorPage.reload();
    await expect(editorPage.getByRole("link", { name: "Firm Settings" })).toBeVisible();
    await editorPage.goto("/firm/settings");
    await expect(editorPage.locator("h1")).toHaveText("Firm Settings");

    // Demote back to Member — exercises the LAST_OWNER guard below and leaves a
    // stable, idempotent state for re-runs (a Firm Member row, not the pristine
    // no-row state).
    await page.reload();
    await page.locator("tr", { hasText: E2E_EDITOR.name }).locator('button:has-text("Demote to Member")').click();
    await expect(page.locator("tr", { hasText: E2E_EDITOR.name })).toContainText("Firm Member");

    // Ahmed is now the sole owner — his own demote button must be disabled (FR-026).
    await page.reload();
    await expect(page.locator("tr", { hasText: "Ahmed Galal" }).locator('button:has-text("Demote to Member")')).toBeDisabled();
  });

  test("a Firm Owner can fully remove a Firm Member, and the last-Owner guard applies to Remove too", async ({
    page,
    context,
  }) => {
    await loginAs(page, SEEDED_FIRM_OWNER.email, SEEDED_FIRM_OWNER.password);
    await page.goto("/firm/settings");

    // Ahmed alone is the sole Owner — his own Remove must be blocked (same LAST_OWNER guard as Demote).
    await expect(page.locator("tr", { hasText: "Ahmed Galal" }).locator('button:has-text("Remove")')).toBeDisabled();

    // Ensure the editor has a Firm Member row to remove (idempotent across re-runs, same as the promote/demote test).
    const editorRow = page.locator("tr", { hasText: E2E_EDITOR.name });
    if (!(await editorRow.count())) {
      await page.selectOption("select", { label: `${E2E_EDITOR.name} (${E2E_EDITOR.email})` });
      await page.click('button:has-text("Make Firm Owner")');
      await expect(editorRow).toBeVisible();
      await editorRow.locator('button:has-text("Demote to Member")').click();
      await expect(editorRow).toContainText("Firm Member");
    }

    // Remove them entirely — the row disappears rather than just changing role.
    await editorRow.locator('button:has-text("Remove")').click();
    await expect(page.getByText("Remove from the Firm permanently?")).toBeVisible();
    await page.click('button:has-text("Yes")');
    await expect(page.locator("tr", { hasText: E2E_EDITOR.name })).toHaveCount(0);

    // No longer a Firm Member at all, they lose the Firm-wide access carve-out.
    const editorPage = await context.newPage();
    await loginAs(editorPage, E2E_EDITOR.email, E2E_EDITOR.password);
    await expect(editorPage.getByRole("link", { name: "Firm Settings" })).toHaveCount(0);
    const directNav = await editorPage.goto("/firm/settings");
    expect(directNav?.status()).toBe(404);
  });

  test("a Firm Owner can create and delete a client Workspace; a non-owner cannot", async ({ page, context }) => {
    await loginAs(page, SEEDED_FIRM_OWNER.email, SEEDED_FIRM_OWNER.password);

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
    const editorPage = await context.newPage();
    await loginAs(editorPage, E2E_EDITOR.email, E2E_EDITOR.password);
    await expect(editorPage.locator('button:has-text("+ New Client")')).toHaveCount(0);
    await expect(editorPage.locator('button[aria-label^="Delete"]')).toHaveCount(0);
  });
});
