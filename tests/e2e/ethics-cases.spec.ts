import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn, E2E_EDITOR } from "./sign-in";

/**
 * The ethics case register (spec 022), following its quickstart. Cases here
 * are described "Ethics Test …" and removed afterwards. References come from
 * a counter that never goes back, so the test reads each new case's
 * reference off the page rather than assuming CASE-0001.
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
  await sql(`DELETE FROM ethics_cases WHERE "workspaceId" = $1 AND description LIKE 'Ethics Test%'`, [WORKSPACE]);
}

const register = (page: Page) => page.locator("section#ethics-cases");

/** Logs a case and returns the reference it was given. */
async function logCase(page: Page, description: string) {
  const before = await register(page).locator("li[data-case]").evaluateAll((els) => els.map((e) => e.getAttribute("data-case")));
  await register(page).getByRole("button", { name: "+ Log case" }).click();
  await register(page).getByLabel("Date received").fill(new Date().toISOString().slice(0, 10));
  await register(page).getByLabel("Channel").selectOption("HOTLINE");
  await register(page).getByLabel("Category").selectOption("FRAUD");
  await register(page).getByLabel("Severity").selectOption("HIGH");
  await register(page).getByLabel("The concern").fill(description);
  await expect(register(page).getByLabel("Reporter asked to remain anonymous")).toBeChecked();
  await expect(register(page).getByLabel("Reporter name")).toHaveCount(0);
  await register(page).getByRole("button", { name: "Log case", exact: true }).click();
  await expect(register(page).locator("li[data-case]")).toHaveCount(before.length + 1);
  const after = await register(page).locator("li[data-case]").evaluateAll((els) => els.map((e) => e.getAttribute("data-case")));
  return after.find((r) => !before.includes(r))!;
}

const caseNumber = (reference: string) => Number(reference.replace("CASE-", ""));

test.describe("ethics case register", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("an Admin logs, investigates and closes a case; references are never reused", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const first = await logCase(page, "Ethics Test expense fraud");
    expect(first).toMatch(/^CASE-\d{4,}$/);
    const firstItem = register(page).locator(`li[data-case="${first}"]`);
    await expect(firstItem).toContainText("New");
    await expect(firstItem).toContainText("Anonymous");

    // Delete a New case: its number isn't reused.
    const second = await logCase(page, "Ethics Test logged by mistake");
    expect(caseNumber(second)).toBe(caseNumber(first) + 1);
    const secondItem = register(page).locator(`li[data-case="${second}"]`);
    await secondItem.getByRole("button", { name: second }).click();
    await secondItem.getByRole("button", { name: "Delete case… (only while New)" }).click();
    await secondItem.getByRole("button", { name: "Delete case", exact: true }).click();
    await expect(secondItem).toHaveCount(0);
    const third = await logCase(page, "Ethics Test gift from supplier");
    expect(caseNumber(third)).toBe(caseNumber(first) + 2);

    // Investigate the first.
    await firstItem.getByRole("button", { name: first }).click();
    await firstItem.getByLabel("Status").selectOption("UNDER_INVESTIGATION");
    await firstItem.getByRole("button", { name: "Save status" }).click();
    await expect(firstItem).toContainText("Under investigation");
    await expect(firstItem.getByRole("button", { name: /Delete case/ })).toHaveCount(0);

    await firstItem.getByLabel("Investigator", { exact: true }).selectOption({ label: "Someone outside the directory…" });
    await firstItem.getByLabel("Investigator name").fill("External counsel");
    await firstItem.getByRole("button", { name: "Save investigator" }).click();
    await expect(firstItem).toContainText("Currently: External counsel");

    for (const note of ["Interviewed the line manager.", "Requested card statements."]) {
      await firstItem.getByLabel("New note").fill(note);
      await firstItem.getByRole("button", { name: "Add note" }).click();
      await expect(firstItem.getByText(note)).toBeVisible();
    }
    // Notes offer no edit or delete.
    await expect(firstItem.locator("ol button")).toHaveCount(0);

    // Closing needs an outcome and a summary.
    await firstItem.getByLabel("Status").selectOption("CLOSED");
    await expect(firstItem.getByLabel("Outcome")).toBeVisible();
    await expect(firstItem.getByLabel("Closing summary")).toBeVisible();
    await firstItem.getByLabel("Outcome").selectOption("SUBSTANTIATED");
    await firstItem.getByLabel("Closing summary").fill("Repaid; written warning issued.");
    await firstItem.getByRole("button", { name: "Save status" }).click();
    await expect(firstItem).toContainText("Outcome: Substantiated");

    const results = await new AxeBuilder({ page }).include("section#ethics-cases").analyze();
    expect(results.violations).toEqual([]);
  });

  test("an Editor sees no case register at all", async ({ page }) => {
    await sql(
      `INSERT INTO ethics_cases (id, "workspaceId", number, "receivedOn", channel, category, severity, description, anonymous, status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 900000 + floor(random() * 99999)::int, now(), 'HOTLINE', 'FRAUD', 'HIGH', 'Ethics Test hidden from editors', true, 'NEW', now(), now())`,
      [WORKSPACE]
    );
    await signIn(page, E2E_EDITOR);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await expect(page.locator("section#risk-register")).toBeVisible();
    await expect(page.locator("section#ethics-cases")).toHaveCount(0);
    expect(await page.content()).not.toContain("Ethics Test hidden from editors");
  });
});
