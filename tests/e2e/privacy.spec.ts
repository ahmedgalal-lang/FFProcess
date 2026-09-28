import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn, E2E_EDITOR } from "./sign-in";

/**
 * The data privacy register (spec 025), following its quickstart. Everything
 * it creates is prefixed "Privacy Test" and removed afterwards.
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
  await sql(`DELETE FROM processing_activities WHERE "workspaceId" = $1 AND name LIKE 'Privacy Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_incidents WHERE "workspaceId" = $1 AND title LIKE 'Privacy Test%'`, [WORKSPACE]);
}

const privacy = (page: Page) => page.locator("section#privacy");
const activity = (page: Page, name: string) => privacy(page).locator(`li[data-activity="${name}"]`);

async function recordActivity(page: Page, name: string, specialCategory: boolean) {
  await privacy(page).getByRole("button", { name: "+ Record activity" }).click();
  await privacy(page).getByLabel("Activity name").fill(name);
  await privacy(page).getByLabel("Lawful basis").selectOption("LEGAL_OBLIGATION");
  await privacy(page).getByLabel("Purpose").fill("Paying employees.");
  await privacy(page).getByLabel("Data subjects (comma-separated)").fill("Employees");
  await privacy(page).getByLabel("Personal data (comma-separated)").fill("Bank details, Sick leave");
  await privacy(page).getByLabel("Retention period").fill("6 years");
  if (specialCategory) await privacy(page).getByLabel(/Special-category data/).check();
  await privacy(page).getByRole("button", { name: "Record activity", exact: true }).click();
  await expect(activity(page, name)).toBeVisible();
}

test.describe("data privacy register", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("flags a DPIA as recommended until an Admin approves one, and an edit returns it to Draft", async ({ page, browser }) => {
    // An Editor records the activity and drafts the DPIA, but can't approve it.
    await signIn(page, E2E_EDITOR);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await recordActivity(page, "Privacy Test payroll", true);
    const payroll = activity(page, "Privacy Test payroll");
    await expect(payroll).toContainText("Special category");
    await expect(payroll).toContainText("DPIA recommended");

    await payroll.getByRole("button", { name: "Privacy Test payroll" }).click();
    await payroll.getByRole("button", { name: "+ Start DPIA" }).click();
    await payroll.getByLabel("Risks to individuals").fill("Health data could be exposed.");
    await payroll.getByLabel("Mitigations").fill("Role-based access.");
    await payroll.getByLabel("Residual risk").selectOption("HIGH");
    await payroll.getByRole("button", { name: "Start DPIA" }).click();
    await expect(payroll).toContainText("May need prior consultation");
    await expect(payroll).toContainText("Draft");
    await expect(payroll.getByRole("button", { name: "Approve DPIA" })).toHaveCount(0);

    // The Firm Owner (an Admin) approves it.
    const admin = await (await browser.newContext()).newPage();
    await signIn(admin);
    await admin.goto(`/workspaces/${WORKSPACE}/governance`);
    const adminPayroll = activity(admin, "Privacy Test payroll");
    await adminPayroll.getByRole("button", { name: "Privacy Test payroll" }).click();
    await adminPayroll.getByRole("button", { name: "Approve DPIA" }).click();
    await expect(adminPayroll.getByText("Approved", { exact: true })).toBeVisible();
    await expect(adminPayroll).not.toContainText("DPIA recommended");

    await adminPayroll.getByLabel("Mitigations").fill("Role-based access and pseudonymised exports.");
    await adminPayroll.getByRole("button", { name: "Save DPIA" }).click();
    await expect(adminPayroll.getByText("Draft", { exact: true })).toBeVisible();
    await expect(adminPayroll).toContainText("DPIA recommended");

    const results = await new AxeBuilder({ page: admin }).include("section#privacy").analyze();
    expect(results.violations).toEqual([]);
    await admin.close();
  });

  test("lists breaches from the incident log and links one to an activity", async ({ page }) => {
    await sql(
      `INSERT INTO governance_incidents (id, "workspaceId", title, description, "occurredAt", severity, category, status, "personalDataBreach", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Privacy Test payslips misdirected', 'x', now(), 'MEDIUM', 'COMPLIANCE', 'OPEN', true, now(), now())`,
      [WORKSPACE]
    );
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await recordActivity(page, "Privacy Test payroll", false);

    const breach = privacy(page).locator(`li[data-breach="Privacy Test payslips misdirected"]`);
    await expect(breach).toContainText("record when the client became aware");
    await breach.getByLabel("Activity affected by Privacy Test payslips misdirected").selectOption({ label: "Privacy Test payroll" });
    await breach.getByRole("button", { name: "Link activity" }).click();
    await expect(breach.getByRole("button", { name: "Unlink Privacy Test payroll from Privacy Test payslips misdirected" })).toBeVisible();
  });
});
