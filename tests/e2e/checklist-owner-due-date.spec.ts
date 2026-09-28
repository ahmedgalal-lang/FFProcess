import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Checklist item owners and due dates (spec 028): a checklist item can be
 * given an owner (a role or a person) and a due date from its Edit form; it
 * reads Overdue once the date passes while it's still open, and its aspect's
 * tab counts it.
 *
 * Works on its own aspect so no other spec's checklist is touched.
 */
const WORKSPACE = "workspace-acme";
const ASPECT = "Due Test Aspect";

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
  await sql(`DELETE FROM governance_aspects WHERE "workspaceId" = $1 AND name = $2`, [WORKSPACE, ASPECT]);
}

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe("checklist item owners and due dates", () => {
  test.beforeEach(async () => {
    await cleanup();
    await sql(`INSERT INTO governance_aspects (id, "workspaceId", name) VALUES (gen_random_uuid()::text, $1, $2)`, [
      WORKSPACE,
      ASPECT,
    ]);
  });
  test.afterEach(cleanup);

  test("assigns an owner and a due date, flags it overdue, and clears when done", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const tabs = page.getByRole("tablist", { name: "Governance focus area" });
    await tabs.getByRole("tab", { name: ASPECT }).click();
    await page.getByRole("button", { name: "+ Add a checklist item by hand" }).click();
    await page.getByPlaceholder("Action title").fill("Adopt a board charter");
    await page.getByPlaceholder("What to do, and why it matters").fill("Nothing written sets out the board's duties.");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const item = page.getByRole("listitem").filter({ hasText: "Adopt a board charter" });
    await expect(item).toBeVisible();
    await expect(item).not.toContainText("Owner:");

    // Owner and a due date that's already passed.
    await item.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("listitem").filter({ has: page.getByLabel("Owner") });
    await form.getByLabel("Owner").selectOption({ label: "Finance Manager" });
    await form.getByLabel("Due date").fill(isoDay(-1));
    await form.getByRole("button", { name: "Save" }).click();

    await expect(item).toContainText("Owner: Finance Manager");
    await expect(item).toContainText(`Due ${isoDay(-1)}`);
    await expect(item.getByText("Overdue")).toBeVisible();
    // Chromium puts a space around the visually hidden separator; the name
    // reads "Due Test Aspect , 1 overdue", which a screen reader says fine.
    await expect(tabs.getByRole("tab", { name: /^Due Test Aspect\s*,\s*1 overdue$/ })).toBeVisible();

    // Done is never overdue.
    await item.getByRole("button", { name: "Mark done" }).click();
    await expect(item.getByText("Overdue")).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: ASPECT, exact: true })).toBeVisible();

    // Clearing both.
    await item.getByRole("button", { name: "Edit" }).click();
    await form.getByLabel("Owner").selectOption({ label: "Unassigned" });
    await form.getByLabel("Due date").fill("");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(item).not.toContainText("Owner:");
    await expect(item).not.toContainText("Due ");
  });
});
