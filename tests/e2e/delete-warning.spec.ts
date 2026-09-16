import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The confirmation used to be a small inline "Delete?" with Yes and No. It did
 * not name the process, did not say that nine steps and fourteen authority
 * rules were attached to it, and did not say the action could be undone — so
 * it read as more final than it was while telling the consultant less than
 * they needed.
 *
 * These assertions use the seeded numbers rather than a regex for "some
 * digits", because the failure worth catching is a count that is wrong, not a
 * count that is missing.
 */
const WORKSPACE = "workspace-acme";

/** The seeded Purchase-to-Pay: the one process carrying real work. */
const POPULATED = { code: "PUR101" };
/** The seeded parent: nothing of its own, two sub-processes beneath it. */
const PARENT = { code: "PUR100", subProcesses: 2 };
/**
 * A process created by this spec rather than borrowed from the seed.
 *
 * This used to use the seeded Vendor Onboarding, which is empty on a fresh
 * database — but another spec in the suite gives it a KPI, so "empty" held
 * when this file ran alone and failed when the whole suite ran in order. A
 * test about emptiness has to own something empty.
 */
const EMPTY = { code: "ZZZ900", name: "Nothing Recorded Yet" };

async function sql(query: string, params: unknown[] = []) {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

test.beforeEach(async () => {
  await sql(`UPDATE processes SET "archivedAt" = NULL WHERE "archivedAt" IS NOT NULL`);
  await sql(`DELETE FROM processes WHERE code = $1`, [EMPTY.code]);
  await sql(
    `INSERT INTO processes (id, "workspaceId", code, name, kpis, "externalEntities", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'workspace-acme', $1, $2, '[]', '[]', now(), now())`,
    [EMPTY.code, EMPTY.name]
  );
});

test.afterAll(async () => {
  await sql(`DELETE FROM processes WHERE code = $1`, [EMPTY.code]);
});

/**
 * The counts the dialog should print, read from the database at test time.
 *
 * Hard-coding the seeded numbers made this spec depend on no other spec having
 * touched PUR101 first, which is a promise the suite cannot keep. Reading them
 * here keeps the assertion meaningful — the dialog has to agree with the
 * database — without being a hostage to test order.
 */
async function expectedCounts(code: string) {
  const { rows } = await sql(
    `SELECT
       (SELECT count(*) FROM process_steps s WHERE s."processId" = p.id) AS steps,
       (SELECT count(*) FROM raci_assignments r
          JOIN activities a ON a.id = r."activityId" WHERE a."processId" = p.id) AS raci,
       (SELECT count(*) FROM authority_rules ar
          JOIN authority_assignments aa ON aa.id = ar."assignmentId" WHERE aa."processId" = p.id) AS rules
     FROM processes p WHERE p.code = $1`,
    [code]
  );
  const row = rows[0] as { steps: string; raci: string; rules: string };
  return { steps: Number(row.steps), raci: Number(row.raci), rules: Number(row.rules) };
}

async function openDeleteDialog(page: import("@playwright/test").Page, code: string) {
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  const row = page.locator("tr", { hasText: code }).first();
  await row.getByRole("button", { name: /^Delete$/ }).click();
  const dialog = page.getByRole("dialog", { name: /delete/i });
  await expect(dialog).toBeVisible();
  // The counts arrive after the dialog opens, so wait for the loading line to go.
  await expect(dialog.getByText(/Checking what this process holds/)).toHaveCount(0);
  return dialog;
}

test("the confirmation names the process and counts what is attached to it", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, POPULATED.code);

  await expect(dialog).toContainText(POPULATED.code);
  await expect(dialog).toContainText("Purchase-to-Pay");
  const expected = await expectedCounts(POPULATED.code);
  expect(expected.steps, "PUR101 should have steps to warn about").toBeGreaterThan(0);
  await expect(dialog).toContainText(`${expected.steps} steps`);
  await expect(dialog).toContainText(`${expected.raci} RACI assignments`);
  await expect(dialog).toContainText(`${expected.rules} authority rules`);
});

test("the confirmation says the deletion can be undone, and where", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, POPULATED.code);

  await expect(dialog).toContainText(/Nothing is destroyed/i);
  await expect(dialog).toContainText(/Deleted processes/);
});

test("declining leaves the process exactly where it was", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, POPULATED.code);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr", { hasText: POPULATED.code })).toHaveCount(1);
});

test("an empty process is described as empty rather than as four zeroes", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, EMPTY.code);

  await expect(dialog).toContainText(/This process is empty/i);
  await expect(dialog).not.toContainText("0 steps");
});

test("deleting a parent warns about the sub-processes it leaves behind", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, PARENT.code);

  await expect(dialog).toContainText(`${PARENT.subProcesses} sub-processes`);
  await expect(dialog).toContainText(/without a parent/i);
});

test("deleting a process others branch from warns they lose their starting point", async ({ page }) => {
  // Nothing branches in the seed, so the relationship is made here and undone
  // afterwards rather than added to the seed for one assertion.
  const step = await sql(
    `SELECT s.id FROM process_steps s JOIN processes p ON p.id = s."processId"
     WHERE p.code = $1 ORDER BY s."order" LIMIT 1`,
    [POPULATED.code]
  );
  const stepId = step.rows[0]?.id as string;
  expect(stepId, "seeded PUR101 should have at least one step").toBeTruthy();
  await sql(`UPDATE processes SET "branchFromStepId" = $1 WHERE code = $2`, [stepId, EMPTY.code]);

  try {
    await signIn(page);
    const dialog = await openDeleteDialog(page, POPULATED.code);
    await expect(dialog).toContainText("1 process");
    await expect(dialog).toContainText(/starting point/i);
  } finally {
    await sql(`UPDATE processes SET "branchFromStepId" = NULL WHERE code = $1`, [EMPTY.code]);
  }
});

test("the confirmation is operable by keyboard alone", async ({ page }) => {
  await signIn(page);
  const dialog = await openDeleteDialog(page, POPULATED.code);

  // Focus lands inside the dialog, on the way out rather than on the red button.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  // Escape dismisses without deleting.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr", { hasText: POPULATED.code })).toHaveCount(1);
});
