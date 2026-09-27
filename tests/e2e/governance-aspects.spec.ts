import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Custom governance aspects (spec 017): the seven aspect tabs stop being a
 * fixed, product-wide list and become real per-workspace rows a consultant
 * can add, rename, and delete — no distinction between the original seven
 * and one added later. Deleting an aspect removes its own assessment but
 * never a risk or policy it had sourced.
 */
const WORKSPACE = "workspace-acme";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function removeAspectByName(name: string) {
  await withClient(async (c) => {
    await c.query(`DELETE FROM governance_aspects WHERE "workspaceId" = $1 AND name = $2`, [WORKSPACE, name]);
  });
}

/** Cleans up whatever a failed run of these tests might have left behind. */
async function cleanupTestDebris() {
  await withClient(async (c) => {
    await c.query(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Data Privacy%'`, [
      WORKSPACE,
    ]);
    await c.query(`DELETE FROM governance_policy_drafts WHERE "workspaceId" = $1 AND title LIKE 'Data Privacy%'`, [
      WORKSPACE,
    ]);
    await c.query(`DELETE FROM governance_aspects WHERE "workspaceId" = $1 AND name LIKE 'Data Privacy%'`, [
      WORKSPACE,
    ]);
    await c.query(`DELETE FROM governance_aspects WHERE "workspaceId" = $1 AND name = 'Data Protection'`, [
      WORKSPACE,
    ]);
  });
}

async function openGovernance(page: import("@playwright/test").Page) {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);
}

test.describe("custom governance aspects", () => {
  test.beforeEach(cleanupTestDebris);
  test.afterEach(cleanupTestDebris);

  test("adds a new aspect, which behaves exactly like a built-in one", async ({ page }) => {
    await openGovernance(page);

    const tabs = page.getByRole("tablist", { name: "Governance focus area" });
    await tabs.getByRole("button", { name: "+ Add aspect" }).click();
    await page.getByLabel("Aspect name").fill("Data Privacy");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const newTab = tabs.getByRole("tab", { name: "Data Privacy" });
    await expect(newTab).toBeVisible();
    await newTab.click();
    await expect(page.getByText("No assessment generated yet for Data Privacy")).toBeVisible();

    // Fully usable immediately — add a checklist item by hand.
    await page.getByRole("button", { name: "+ Add a checklist item by hand" }).click();
    await page.getByPlaceholder("Action title").fill("Draft a data privacy notice");
    await page.getByPlaceholder("What to do, and why it matters").fill("Nothing today discloses data use.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Draft a data privacy notice")).toBeVisible();
  });

  test("rejects a duplicate aspect name, leaving the existing one untouched", async ({ page }) => {
    await openGovernance(page);

    const tabs = page.getByRole("tablist", { name: "Governance focus area" });
    await tabs.getByRole("button", { name: "+ Add aspect" }).click();
    await page.getByLabel("Aspect name").fill("Data Privacy");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(tabs.getByRole("tab", { name: "Data Privacy" })).toBeVisible();

    await tabs.getByRole("button", { name: "+ Add aspect" }).click();
    await page.getByLabel("Aspect name").fill("Data Privacy");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(/already an aspect/i)).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Data Privacy" })).toHaveCount(1);
  });

  test("renames an aspect without disturbing what's already on it, and rejects a colliding name", async ({
    page,
  }) => {
    await openGovernance(page);

    // A freshly added aspect, guaranteed empty — avoids any dependency on
    // a built-in aspect's own, possibly shared, existing state.
    const tabs = page.getByRole("tablist", { name: "Governance focus area" });
    await tabs.getByRole("button", { name: "+ Add aspect" }).click();
    await page.getByLabel("Aspect name").fill("Data Privacy");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await tabs.getByRole("tab", { name: "Data Privacy" }).click();

    await page.getByRole("button", { name: "+ Add a checklist item by hand" }).click();
    await page.getByPlaceholder("Action title").fill("Draft a data privacy notice");
    await page.getByPlaceholder("What to do, and why it matters").fill("Nothing today discloses data use.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Draft a data privacy notice")).toBeVisible();

    await tabs.getByRole("button", { name: "Rename Data Privacy" }).click();
    await page.getByLabel("Aspect name").fill("Data Protection");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const renamed = tabs.getByRole("tab", { name: "Data Protection" });
    await expect(renamed).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Data Privacy" })).toHaveCount(0);
    await renamed.click();
    await expect(page.getByText("Draft a data privacy notice")).toBeVisible();

    // Renaming another aspect to a name already in use is rejected.
    await tabs.getByRole("button", { name: "Rename ESG" }).click();
    await page.getByLabel("Aspect name").fill("Data Protection");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/already an aspect/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Clean up under the renamed name (afterEach only matches "Data Privacy").
    await removeAspectByName("Data Protection");
  });

  test("deleting an aspect removes its assessment, but a risk and a policy it sourced both survive as hand-added", async ({
    page,
  }) => {
    await openGovernance(page);

    const tabs = page.getByRole("tablist", { name: "Governance focus area" });
    await tabs.getByRole("button", { name: "+ Add aspect" }).click();
    await page.getByLabel("Aspect name").fill("Data Privacy 2");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const newTab = tabs.getByRole("tab", { name: "Data Privacy 2" });
    await expect(newTab).toBeVisible();
    await newTab.click();

    await page.getByRole("button", { name: "+ Add a checklist item by hand" }).click();
    await page.getByPlaceholder("Action title").fill("Something to delete with the aspect");
    await page.getByPlaceholder("What to do, and why it matters").fill("Placeholder text.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Something to delete with the aspect")).toBeVisible();

    await page.getByRole("button", { name: "+ Add risk" }).click();
    await page.getByPlaceholder("Risk title").fill("Data Privacy risk to keep");
    await page.getByPlaceholder("What could go wrong, and why it matters").fill("Should survive the delete.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("tr", { hasText: "Data Privacy risk to keep" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add policy" }).click();
    await page.getByPlaceholder("Policy title").fill("Data Privacy policy to keep");
    await page.getByPlaceholder(/The policy itself/).fill("1. Purpose\n2. Scope");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: /Data Privacy policy to keep/ })).toBeVisible();

    // Both the risk and the policy already read "Added manually" — nothing
    // sourced them from the aspect's own assessment (they were hand-added),
    // so this test's real subject is the checklist item, which the delete
    // must take with it.
    await tabs.getByRole("button", { name: "Delete Data Privacy 2" }).click();
    await tabs.getByText(/Delete.*Data Privacy 2/).waitFor();
    await tabs.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(newTab).toHaveCount(0);
    // The view moved to a remaining aspect, not a blank tab (FR-010).
    await expect(tabs.getByRole("tab", { selected: true })).toBeVisible();

    // The risk and policy survive — reachable regardless of which tab is active.
    await expect(page.locator("tr", { hasText: "Data Privacy risk to keep" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Data Privacy policy to keep/ })).toBeVisible();

    // Clean up the two hand-added items this test leaves behind.
    await page.locator("tr", { hasText: "Data Privacy risk to keep" }).getByRole("button", { name: /Delete risk/ }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: /Data Privacy policy to keep/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  });
});
