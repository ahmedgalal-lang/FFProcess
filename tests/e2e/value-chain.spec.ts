import path from "node:path";
import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";

const FIXTURE = path.join(process.cwd(), "tests/fixtures/value-chain-sample.xlsx");
const SEEDED_ROLES = ["AP Clerk", "Finance Manager", "Procurement Lead"];

/**
 * Importing necessarily creates a process, phases and departments, and none of
 * those can be fully removed through the UI — archiving a process leaves the
 * row behind. So this spec puts the shared development database back itself
 * rather than leaving the next run to find its leftovers.
 */
test.afterAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM processes WHERE name = 'Sample Value Chain'`);
    await client.query(`DELETE FROM phases WHERE "workspaceId" = 'workspace-acme'`);
    await client.query(`DELETE FROM roles WHERE "workspaceId" = 'workspace-acme' AND name <> ALL($1)`, [
      SEEDED_ROLES,
    ]);
  } finally {
    await client.end();
  }
});

test("Value Chain: import a spreadsheet, then read, filter and re-phase the board", async ({ page }) => {
  await page.goto("/login");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/workspaces");
  await page.goto("/workspaces/workspace-acme/value-chain");
  await expect(page.locator("h1")).toHaveText("Value Chain");

  // The board shows the work that already exists rather than waiting to be set
  // up: with no phases yet, every seeded step is unphased.
  await expect(page.getByRole("heading", { name: /unphased/i })).toBeVisible();

  // --- Preview says what would happen, and commits nothing ---
  await page.getByRole("button", { name: "Import from spreadsheet" }).click();
  await page.getByLabel("Spreadsheet").setInputFiles(FIXTURE);
  await page.getByLabel("New process name").fill("Sample Value Chain");
  await page.getByRole("button", { name: "Preview" }).click();

  // It found the value-chain tab past the workshop-notes one, and says which.
  await expect(page.getByText(/Found 5 activities on sheet Integrated Process Map/)).toBeVisible();
  await expect(page.getByText("Initiation → Evaluation → Proposal → Delivery → Closure")).toBeVisible();
  await expect(page.getByText("1 row will be skipped")).toBeVisible();
  await expect(page.getByRole("heading", { name: /initiation/i })).toBeHidden();

  // --- Committing creates the phases, departments and activities ---
  await page.getByRole("button", { name: "Import 5 activities" }).click();
  await expect(page.getByText("Imported 5 activities.")).toBeVisible();

  await page.reload();
  const columnTitles = () => page.locator("main section h2");
  await expect(columnTitles().first()).toContainText("Initiation");
  await expect(page.getByRole("heading", { name: "Enquiry Received" })).toBeVisible();

  // The owner, the supporting departments and the description all came across —
  // the dash that meant "nobody" in the sheet did not become a department.
  await expect(page.getByText("Support: Executive", { exact: true })).toBeVisible();
  await expect(page.getByText("Log the enquiry and confirm it is in scope.")).toBeVisible();

  // --- By Owner columns the same cards a different way ---
  await page.getByRole("button", { name: "By Owner" }).click();
  await expect(page.getByRole("heading", { name: /commercial/i })).toBeVisible();
  await page.getByRole("button", { name: "By Phase" }).click();

  // --- Search narrows the board ---
  await page.getByLabel("Search activities").fill("Pricing");
  await expect(page.getByText(/1 of \d+ activities match/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enquiry Received" })).toBeHidden();
  await page.getByLabel("Search activities").fill("");

  // --- Moving a card is a real change to the step, not a board arrangement ---
  await page.getByLabel("Phase for Enquiry Received").selectOption({ label: "Closure" });
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByLabel("Phase for Enquiry Received")).toHaveValue(
    await page.getByLabel("Phase for Final Invoice").inputValue()
  );

  // --- Deleting a phase leaves its activities in place, unphased ---
  await page.getByRole("button", { name: "Manage phases" }).click();
  await page.getByLabel("Delete Delivery").click();
  await page.getByRole("button", { name: "Yes" }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: /unphased/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mobilisation" })).toBeVisible();
});
