import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/**
 * The incident log (spec 024), following its quickstart. Everything it
 * creates is prefixed "Incident Test" and removed afterwards.
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
  await sql(`DELETE FROM governance_incidents WHERE "workspaceId" = $1 AND title LIKE 'Incident Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Incident Test%'`, [WORKSPACE]);
}

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const incidents = (page: Page) => page.locator("section#incidents");
const item = (page: Page, title: string) => incidents(page).locator(`li[data-incident="${title}"]`);

test.describe("incident log", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("logs an incident, requires a root cause to resolve, and closes it despite an open action", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    await incidents(page).getByRole("button", { name: "+ Log incident" }).click();
    await incidents(page).getByLabel("Incident title").fill("Incident Test payment misdirected");
    await incidents(page).getByLabel("What happened").fill("A supplier's bank details were changed by a phishing email.");
    await incidents(page).getByLabel("Date occurred").fill(isoDay(-3));
    await incidents(page).getByLabel("Severity").selectOption("HIGH");
    await incidents(page).getByLabel("Category").selectOption("IT_SECURITY");
    await incidents(page).getByLabel("Process").selectOption({ label: "Purchase-to-Pay" });
    await incidents(page).getByRole("button", { name: "Log incident", exact: true }).click();

    const row = item(page, "Incident Test payment misdirected");
    await expect(row).toContainText("High");
    await expect(row).toContainText("Open 3 days");

    await row.getByRole("button", { name: "Incident Test payment misdirected" }).click();
    await row.getByLabel("Status").selectOption("RESOLVED");
    await row.getByRole("button", { name: "Save incident" }).click();
    await expect(row).toContainText("Record a root cause before resolving or closing an incident.");

    // Two corrective actions: one overdue, one done.
    await row.getByLabel("New corrective action").fill("Incident Test call-back check");
    await row.getByLabel("Corrective action due date").fill(isoDay(-1));
    await row.getByRole("button", { name: "Add corrective action" }).click();
    await expect(row.getByText("Incident Test call-back check")).toBeVisible();
    await expect(row).toContainText("1 overdue action");

    await row.getByLabel("New corrective action").fill("Incident Test retrain AP team");
    await row.getByRole("button", { name: "Add corrective action" }).click();
    const done = row.getByRole("checkbox", { name: "Done: Incident Test retrain AP team" });
    await done.click();
    await expect(done).toBeChecked();

    await row.getByLabel("Root cause").fill("No call-back check on bank detail changes.");
    await row.getByLabel("Status").selectOption("CLOSED");
    await expect(row.getByRole("alert")).toContainText("1 corrective action is still open");
    await row.getByRole("button", { name: "Save incident" }).click();
    await expect(row).toContainText("Closed after 3 days");

    // The open incident, with its actions, breach and risk controls, passes axe.
    await row.getByLabel("Personal data breach").check();
    const results = await new AxeBuilder({ page }).include("section#incidents").analyze();
    expect(results.violations).toEqual([]);
  });

  test("counts down a personal data breach's notification clock and links a risk", async ({ page }) => {
    const awareAt = new Date(Date.now() - 60 * 60 * 60 * 1000); // 60 hours ago
    await sql(
      `INSERT INTO governance_incidents (id, "workspaceId", title, description, "occurredAt", severity, category, status, "personalDataBreach", "breachAwareAt", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Incident Test customer list emailed', 'Sent to the wrong distribution list.', $2, 'MEDIUM', 'COMPLIANCE', 'OPEN', true, $2, now(), now())`,
      [WORKSPACE, awareAt]
    );
    await sql(
      `INSERT INTO governance_risks (id, "workspaceId", title, description, likelihood, impact, status, "handManaged", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Incident Test data leak risk', 'x', 'MEDIUM', 'HIGH', 'OPEN', true, now(), now())`,
      [WORKSPACE]
    );

    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const row = item(page, "Incident Test customer list emailed");
    await expect(row).toContainText("12 hours left to notify the regulator");

    await row.getByRole("button", { name: "Incident Test customer list emailed" }).click();
    await row.getByRole("radio", { name: "Regulator notified" }).check();
    await row.getByLabel("Notified at").fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await row.getByRole("button", { name: "Save personal data" }).click();
    await expect(row).toContainText("Regulator notified");
    await expect(row).not.toContainText("left to notify");

    await row.getByLabel("Risk to link").selectOption({ label: "Incident Test data leak risk" });
    await row.getByRole("button", { name: "Link risk" }).click();
    await expect(row.getByRole("button", { name: "Unlink risk: Incident Test data leak risk" })).toBeVisible();

    // The risk names the incident on the Risk Register.
    const riskRow = page.locator("section#risk-register tr", { hasText: "Incident Test data leak risk" });
    await expect(riskRow).toContainText("Incident Test customer list emailed");
  });
});
