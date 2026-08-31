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
  // A board with a column per phase needs room: at the default width the later
  // columns sit off-screen, where a pointer can't reach them to drop a card.
  await page.setViewportSize({ width: 1500, height: 1000 });
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

  // --- A card is editable in place, and the edit is to the step itself ---
  await page.getByRole("button", { name: "Edit Technical Review" }).click();
  const editor = page.locator("form", { hasText: "Supporting departments" });
  await editor.getByLabel("Activity").fill("Technical Review & Sizing");
  await editor.getByLabel("Owner").selectOption({ label: "Commercial" });
  await editor.getByLabel("Description").fill("Assess what the work needs, and how big it is.");
  await editor.getByRole("checkbox", { name: "Finance", exact: true }).check();
  await editor.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(1200);

  await expect(page.getByRole("heading", { name: "Technical Review & Sizing" })).toBeVisible();
  await expect(page.getByText("Assess what the work needs, and how big it is.")).toBeVisible();
  await expect(page.getByText("Support: Finance", { exact: true })).toBeVisible();

  // The board edits the same step the Process Map holds, not a copy of it.
  await page.goto("/workspaces/workspace-acme/processes");
  await page.locator("tr", { hasText: "Sample Value Chain" }).first().locator("text=Open").click();
  await page.waitForURL("**/map");
  await page.click('button:has-text("Steps List")');
  await expect(page.getByText("Technical Review & Sizing", { exact: true })).toBeVisible();
  await page.goto("/workspaces/workspace-acme/value-chain");

  // --- Dragging a card from one phase to another moves it ---
  // Put it in the first column first, so the drag starts from a known place
  // rather than wherever the earlier steps left it — a column far to the right
  // can be scrolled out of reach of the pointer.
  await page.getByLabel("Phase for Enquiry Received").selectOption({ label: "Initiation" });
  await page.waitForTimeout(1200);
  await page.reload();

  const card = page.locator("article", { hasText: "Enquiry Received" }).first();
  const proposal = page
    .locator("section[data-column-key]")
    .filter({ has: page.getByRole("heading", { name: /^Proposal/ }) })
    .first();
  await expect(card).toBeVisible();
  await expect(proposal).toBeVisible();
  const from = (await card.boundingBox())!;
  const to = (await proposal.boundingBox())!;

  await page.mouse.move(from.x + 60, from.y + 30);
  await page.mouse.down();
  // Past the threshold that separates a drag from a click, then over the column.
  await page.mouse.move(from.x + 90, from.y + 40, { steps: 5 });
  await page.mouse.move(to.x + 100, to.y + 120, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(proposal).toBeVisible();

  await expect(proposal.getByRole("heading", { name: "Enquiry Received" })).toBeVisible();

  // --- Activities can be ordered within their own phase ---
  // Proposal now holds Enquiry Received and Pricing; moving one past the other
  // is a different sequence from either step's place in its own process.
  const proposalCards = () => proposal.locator("article h3");
  const before = await proposalCards().allInnerTexts();
  expect(before).toHaveLength(2);

  await page.getByLabel(`Move ${before[1]} up in this phase`).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(proposal).toBeVisible();
  expect(await proposalCards().allInnerTexts()).toEqual([before[1], before[0]]);

  // The first card can't move up and the last can't move down.
  await expect(page.getByLabel(`Move ${before[1]} up in this phase`)).toBeHidden();
  await expect(page.getByLabel(`Move ${before[0]} down in this phase`)).toBeHidden();

  // --- A phase is renamed, reordered and deleted from its own column ---
  await page.getByRole("button", { name: "Rename Delivery" }).click();
  await page.getByLabel("Rename Delivery").fill("Mobilisation & Delivery");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: /Mobilisation & Delivery/i })).toBeVisible();

  // Moving it earlier reorders the chain itself, so the columns swap.
  const headings = () => page.locator("main section h2");
  await page.getByLabel("Move Mobilisation & Delivery earlier").click();
  await page.waitForTimeout(1200);
  await expect(headings().nth(2)).toContainText("Mobilisation & Delivery");
  await expect(headings().nth(3)).toContainText("Proposal");

  // Deleting leaves its activities in place, unphased.
  await page.getByLabel("Delete Mobilisation & Delivery").click();
  await page.getByRole("button", { name: "Yes" }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: /unphased/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mobilisation" })).toBeVisible();
});
