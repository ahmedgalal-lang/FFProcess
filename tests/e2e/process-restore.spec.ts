import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { processIdByCode } from "./seed-lookup";

/**
 * Deleting a process has always been reversible — it sets a timestamp and every
 * query filters it out — but nothing in the application could undo it, so a
 * consultant who deleted the wrong process needed someone with database access
 * to get it back.
 *
 * The assertion that matters is not "the row reappears" but "the work
 * reappears": a restore that quietly lost a process's authority rules would
 * pass a row-level check and still be the bug this feature exists to prevent.
 * So the spec records real content before deleting and demands the same content
 * afterwards.
 */
const WORKSPACE = "workspace-acme";
const CODE = "PUR101";

/** Undo anything a failed run left deleted, so a rerun starts from a clean list. */
async function undeleteAll() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE processes SET "archivedAt" = NULL WHERE "archivedAt" IS NOT NULL`);
  } finally {
    await client.end();
  }
}

test.beforeEach(undeleteAll);
test.afterAll(undeleteAll);

/**
 * The row whose *code cell* is this process.
 *
 * Filtering rows by `hasText: code` is wrong here and cost a debugging round:
 * a sub-process row carries the text "sub-process of PUR100", so asking for
 * rows containing "PUR100" returns the parent and both its children. The code
 * cell is the only place the code identifies the row rather than describes it.
 * The optional arrow is the indent marker sub-process rows carry.
 */
function rowFor(page: import("@playwright/test").Page, code: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: new RegExp(`^(\\u21b3\\s*)?${code}$`) }) });
}

async function deleteProcess(page: import("@playwright/test").Page, code: string) {
  await rowFor(page, code).getByRole("button", { name: /^Delete$/ }).click();
  const dialog = page.getByRole("dialog", { name: /delete/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Delete process$/ }).click();
  await expect(rowFor(page, code)).toHaveCount(0);
}

test("a deleted process can be restored with everything it held", async ({ page }) => {
  const processId = await processIdByCode(CODE);
  await signIn(page);

  // Record real content from two different surfaces before deleting.
  // React Flow renders one node per step plus one per swimlane, which is what
  // core-workflows.spec.ts already counts, so it is a selector that exists.
  await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/map`);
  const stepNodes = page.locator(".react-flow__node");
  await expect(stepNodes.first()).toBeVisible();
  const stepCount = await stepNodes.count();
  expect(stepCount).toBeGreaterThan(0);
  const mapHeading = await page.locator("h1, h2").first().textContent();

  await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/authority`);
  const authorityText = await page.locator("table").first().innerText();
  expect(authorityText.length).toBeGreaterThan(0);

  // Delete it.
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await deleteProcess(page, CODE);

  // Gone from the export picker too, not just the list (FR-012).
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await expect(page.getByText(CODE, { exact: false })).toHaveCount(0);

  // Listed as deleted, with the facts needed to identify it.
  await page.goto(`/workspaces/${WORKSPACE}/processes/deleted`);
  const deletedRow = rowFor(page, CODE);
  await expect(deletedRow).toHaveCount(1);

  // Restore it.
  await deletedRow.getByRole("button", { name: /^Restore/ }).click();
  await expect(rowFor(page, CODE)).toHaveCount(0);

  // Back on the list, and back with its content.
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await expect(rowFor(page, CODE)).toHaveCount(1);

  await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/map`);
  await expect(page.locator("h1, h2").first()).toHaveText(mapHeading ?? "");
  await expect(page.locator(".react-flow__node")).toHaveCount(stepCount);

  await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/authority`);
  expect(await page.locator("table").first().innerText()).toBe(authorityText);
});

test("the deleted page says so plainly when nothing has been deleted", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes/deleted`);
  await expect(page.getByText("Nothing has been deleted")).toBeVisible();
});

test("the Processes page links to the deleted list and counts what is there", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);

  const link = page.getByRole("link", { name: /Deleted processes/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/Deleted processes$/);

  await deleteProcess(page, CODE);
  await expect(page.getByRole("link", { name: /Deleted processes/ })).toHaveText(/\(1\)/);
});

/**
 * A process may have sub-processes filed beneath it. Deleting the parent must
 * not take them with it — the children are separate work someone else may own —
 * and restoring the parent must put the nesting back without anyone re-entering
 * it.
 */
test("sub-processes survive their parent's deletion and re-nest when it returns", async ({ page }) => {
  const PARENT = "PUR100";
  const CHILD = "PUR101";

  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);

  // Nested to begin with.
  const childRow = () => rowFor(page, CHILD);
  await expect(childRow()).toContainText(`sub-process of ${PARENT}`);
  await expect(childRow()).not.toContainText("(deleted)");

  await deleteProcess(page, PARENT);

  // The child is still listed and still reachable — not hidden with its parent.
  await expect(childRow()).toHaveCount(1);
  await expect(childRow()).toContainText("(deleted)");
  await expect(childRow().getByRole("link", { name: /Open/ })).toBeVisible();

  // Put the parent back; the nesting reads as it did before.
  await page.goto(`/workspaces/${WORKSPACE}/processes/deleted`);
  await rowFor(page, PARENT).getByRole("button", { name: /^Restore/ }).click();
  await expect(rowFor(page, PARENT)).toHaveCount(0);

  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await expect(childRow()).toContainText(`sub-process of ${PARENT}`);
  await expect(childRow()).not.toContainText("(deleted)");
});

test("a sub-process can be restored while its parent is still deleted", async ({ page }) => {
  const PARENT = "PUR100";
  const CHILD = "PUR102";

  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await deleteProcess(page, CHILD);
  await deleteProcess(page, PARENT);

  // Restoring the child alone must succeed and leave it reachable, rather than
  // returning it to the list underneath a parent that is not there.
  await page.goto(`/workspaces/${WORKSPACE}/processes/deleted`);
  await rowFor(page, CHILD).getByRole("button", { name: /^Restore/ }).click();

  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  const row = rowFor(page, CHILD);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("(deleted)");
  await expect(row.getByRole("link", { name: /Open/ })).toBeVisible();
});
