import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Risk heat map and treatment plans (spec 027). Seeds hand-added risks (no
 * source aspect, so they show under every tab), prefixed "Heat Test".
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
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Heat Test%'`, [WORKSPACE]);
}

async function addRisk(title: string, likelihood: string, impact: string, status = "OPEN") {
  await sql(
    `INSERT INTO governance_risks (id, "workspaceId", title, description, likelihood, impact, status, "handManaged", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'Seeded for the heat map test.', $3, $4, $5, true, now(), now())`,
    [WORKSPACE, title, likelihood, impact, status]
  );
}

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe("risk heat map and treatment plans", () => {
  test.beforeEach(async () => {
    await cleanup();
    // Low × Low is used by nothing else seeded, so its count is exactly ours.
    await addRisk("Heat Test Alpha", "LOW", "LOW");
    await addRisk("Heat Test Beta", "LOW", "LOW");
    await addRisk("Heat Test Closed", "LOW", "LOW", "CLOSED");
  });
  test.afterEach(cleanup);

  test("counts open risks per cell and filters the register to them", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const cell = page.getByRole("button", { name: /^\d+ risks?, likelihood Low, impact Low, level Low$/ });
    await expect(cell).toBeVisible();
    const label = (await cell.getAttribute("aria-label"))!;
    const count = Number(label.split(" ")[0]);
    expect(count).toBeGreaterThanOrEqual(2); // ours, never the closed one

    await cell.click();
    await expect(cell).toHaveAttribute("aria-pressed", "true");
    const register = page.locator("section#risk-register");
    await expect(register.getByRole("table", { name: "Risks", exact: true }).locator("tbody > tr")).toHaveCount(count);
    await expect(register).not.toContainText("Heat Test Closed");

    await register.getByRole("button", { name: "Show all risks" }).click();
    await expect(register).toContainText("Heat Test Closed");
  });

  test("records a treatment plan and flags an overdue action until it's done", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const row = page.locator("section#risk-register tr", { hasText: "Heat Test Alpha" });
    await row.getByRole("button", { name: /Treatment/ }).click();
    const panel = page.locator("section#risk-register").getByText("Current level:").locator("..").locator("..");

    await panel.getByLabel("Strategy").selectOption("MITIGATE");
    await panel.getByLabel("Target likelihood").selectOption("LOW");
    await panel.getByLabel("Target impact").selectOption("LOW");
    await panel.getByLabel("Rationale").fill("Monitor quarterly.");
    await panel.getByRole("button", { name: "Save treatment" }).click();
    await expect(panel).toContainText("target: Low");

    await panel.getByLabel("New treatment action").fill("Heat Test action");
    await panel.getByLabel("Action owner").selectOption({ label: "Finance Manager" });
    await panel.getByLabel("Action due date").fill(isoDay(-1));
    await panel.getByRole("button", { name: "Add action" }).click();
    await expect(panel.getByText("Heat Test action")).toBeVisible();
    await expect(panel.getByText("Overdue")).toBeVisible();
    await expect(row).toContainText("Overdue treatment");

    // Controlled by the saved state, so it flips once the save lands.
    const done = panel.getByRole("checkbox", { name: "Done: Heat Test action" });
    await done.click();
    await expect(done).toBeChecked();
    await expect(panel.getByText("Overdue")).toHaveCount(0);
    await expect(row).not.toContainText("Overdue treatment");
  });
});
