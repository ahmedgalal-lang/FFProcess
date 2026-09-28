import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn, E2E_EDITOR } from "./sign-in";

/**
 * The Governance summary panel (spec 026). Counts in the seeded workspace
 * depend on what other tests leave behind, so these tests work from deltas:
 * read a tile, add records, and check it moved by exactly that much.
 */
const WORKSPACE = "workspace-acme";
const EMPTY_WORKSPACE = "workspace-dashboard-empty-e2e";

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
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Dashboard Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM ethics_cases WHERE "workspaceId" = $1 AND description LIKE 'Dashboard Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM workspaces WHERE id = $1`, [EMPTY_WORKSPACE]);
}

const summary = (page: Page) => page.getByRole("region", { name: "What needs attention" });
const tile = (page: Page, id: string) => summary(page).locator(`li[data-tile="${id}"]`);
/** A tile's number; 0 when there's no tile (a workspace with nothing recorded shows none). */
async function tileCount(page: Page, id: string) {
  if ((await tile(page, id).count()) === 0) return 0;
  return Number((await tile(page, id).locator("span").first().innerText()).match(/^\d+/)![0]);
}

test.describe("governance summary panel", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("counts open High risks across every aspect and links to exactly those", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await expect(summary(page)).toBeVisible();
    const before = await tileCount(page, "risks-high");

    for (const [title, status] of [
      ["Dashboard Test open high", "OPEN"],
      ["Dashboard Test mitigating high", "MITIGATING"],
      ["Dashboard Test closed high", "CLOSED"],
    ]) {
      await sql(
        `INSERT INTO governance_risks (id, "workspaceId", title, description, likelihood, impact, status, "handManaged", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'x', 'HIGH', 'CRITICAL', $3, true, now(), now())`,
        [WORKSPACE, title, status]
      );
    }
    await page.reload();
    await expect.poll(() => tileCount(page, "risks-high")).toBe(before + 2);

    await tile(page, "risks-high").getByRole("link").click();
    await expect(page).toHaveURL(/\?riskLevel=HIGH#risk-register$/);
    const register = page.locator("section#risk-register");
    await expect(register.getByRole("status")).toContainText("Showing every open High risk across all aspects");
    await expect(register.getByRole("table", { name: "Risks", exact: true }).locator("tbody > tr")).toHaveCount(before + 2);
    await expect(register).toContainText("Dashboard Test open high");
    await expect(register).not.toContainText("Dashboard Test closed high");

    await register.getByRole("button", { name: "Show this aspect's risks" }).click();
    await expect(page).not.toHaveURL(/riskLevel/);
    await expect(register.getByRole("status")).toHaveCount(0);

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("shows the ethics tile to an Admin only", async ({ page }) => {
    await sql(
      `INSERT INTO ethics_cases (id, "workspaceId", number, "receivedOn", channel, category, severity, description, anonymous, status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 800000 + floor(random() * 99999)::int, now(), 'HOTLINE', 'FRAUD', 'HIGH', 'Dashboard Test case', true, 'NEW', now(), now())`,
      [WORKSPACE]
    );
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await expect(tile(page, "ethics-open")).toBeVisible();

    const editorPage = await (await page.context().browser()!.newContext()).newPage();
    await signIn(editorPage, E2E_EDITOR);
    await editorPage.goto(`/workspaces/${WORKSPACE}/governance`);
    await expect(summary(editorPage)).toBeVisible();
    await expect(tile(editorPage, "ethics-open")).toHaveCount(0);
    await expect(summary(editorPage)).not.toContainText("ethics");
    await editorPage.close();
  });

  test("says nothing is recorded yet on a workspace with no governance records", async ({ page }) => {
    await sql(
      `INSERT INTO workspaces (id, "firmId", name, "updatedAt") SELECT $1, "firmId", 'Dashboard Empty E2E', now() FROM workspaces WHERE id = $2`,
      [EMPTY_WORKSPACE, WORKSPACE]
    );
    await signIn(page);
    await page.goto(`/workspaces/${EMPTY_WORKSPACE}/governance`);
    await expect(summary(page)).toContainText("Nothing has been recorded yet");
    await expect(summary(page).locator("li[data-tile]")).toHaveCount(0);
  });
});
