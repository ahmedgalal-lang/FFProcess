import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Renaming a process moves an automatic code to the new name's prefix, and
 * its sub-processes with it; a code typed in the Edit dialog wins. Seeds a
 * "Qqx recode test" parent (QQX100) and child (QQX101), removed afterwards.
 */
const WORKSPACE = "workspace-acme";

async function sql(query: string, params: unknown[] = []) {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

async function cleanup() {
  await sql(`DELETE FROM processes WHERE "workspaceId" = $1 AND name ILIKE '%recode test%'`, [WORKSPACE]);
}

test.beforeEach(async () => {
  await cleanup();
  await sql(
    `INSERT INTO processes (id, "workspaceId", code, name, "updatedAt") VALUES ('recode-parent', $1, 'QQX100', 'Qqx recode test', now())`,
    [WORKSPACE]
  );
  await sql(
    `INSERT INTO processes (id, "workspaceId", code, name, "parentProcessId", "updatedAt")
     VALUES ('recode-child', $1, 'QQX101', 'Qqx recode test child', 'recode-parent', now())`,
    [WORKSPACE]
  );
});
test.afterEach(cleanup);

test("renaming a process updates its code and its sub-process's code", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);

  const row = page.locator("tr", { hasText: "Qqx recode test" }).filter({ hasNotText: "child" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Qqx recode test" });
  await expect(dialog.getByLabel("Process code")).toHaveValue("QQX100");
  await dialog.getByLabel("Name", { exact: true }).fill("Wwy recode test");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.locator("tr", { hasText: "Wwy recode test" }).first()).toContainText("WWY100");
  await expect(page.locator("tr", { hasText: "Qqx recode test child" })).toContainText("WWY101");

  // A code typed in the dialog wins over the automatic one.
  const renamed = page.locator("tr", { hasText: "Wwy recode test" }).first();
  await renamed.getByRole("button", { name: "Edit", exact: true }).click();
  const again = page.getByRole("dialog", { name: "Edit Wwy recode test" });
  await again.getByLabel("Process code").fill("RCT900");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(again).toHaveCount(0);
  await expect(page.locator("tr", { hasText: "Wwy recode test" }).first()).toContainText("RCT900");
});
