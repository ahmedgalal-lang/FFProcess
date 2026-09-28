import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/**
 * The vendor register (spec 023), following its quickstart. Vendors and the
 * risk it seeds are prefixed "Vendor Test" and removed afterwards.
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
  await sql(`DELETE FROM vendors WHERE "workspaceId" = $1 AND name LIKE 'Vendor Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Vendor Test%'`, [WORKSPACE]);
}

function isoDay(months: number, days = 0) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const vendors = (page: Page) => page.locator("section#vendors");
const vendor = (page: Page, name: string) => vendors(page).locator(`li[data-vendor="${name}"]`);

async function addVendor(page: Page, name: string, criticality: string) {
  await vendors(page).getByRole("button", { name: "+ Add vendor" }).click();
  await vendors(page).getByLabel("Vendor name").fill(name);
  await vendors(page).getByLabel("Criticality").selectOption(criticality);
  await vendors(page).getByLabel("Service provided").fill("Freight forwarding");
  await vendors(page).getByRole("button", { name: "Add vendor", exact: true }).click();
  await expect(vendor(page, name)).toBeVisible();
}

test.describe("vendor register", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("lists vendors most critical first and flags overdue due diligence and renewal", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    await addVendor(page, "Vendor Test Medium", "MEDIUM");
    await addVendor(page, "Vendor Test Low", "LOW");
    await addVendor(page, "Vendor Test Critical", "CRITICAL");

    const names = await vendors(page).locator("li[data-vendor^='Vendor Test']").evaluateAll((els) => els.map((e) => e.getAttribute("data-vendor")));
    expect(names).toEqual(["Vendor Test Critical", "Vendor Test Medium", "Vendor Test Low"]);

    const critical = vendor(page, "Vendor Test Critical");
    await critical.getByRole("button", { name: "Vendor Test Critical" }).click();
    await critical.getByLabel("Status").selectOption("COMPLETED");
    await critical.getByLabel("Last completed").fill(isoDay(-13));
    await critical.getByLabel("Review every (months)").fill("12");
    await critical.getByLabel("Ends").fill(isoDay(0, 20));
    await critical.getByRole("button", { name: "Save vendor" }).click();
    await expect(critical).toContainText("Due diligence overdue");
    await expect(critical).toContainText("Renewal within 60 days");

    const results = await new AxeBuilder({ page }).include("section#vendors").analyze();
    expect(results.violations).toEqual([]);
  });

  test("links a vendor to a risk, and deleting the risk keeps the vendor", async ({ page }) => {
    await sql(
      `INSERT INTO governance_risks (id, "workspaceId", title, description, likelihood, impact, status, "handManaged", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Vendor Test single carrier', 'x', 'MEDIUM', 'HIGH', 'OPEN', true, now(), now())`,
      [WORKSPACE]
    );
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await addVendor(page, "Vendor Test Carrier", "HIGH");

    const carrier = vendor(page, "Vendor Test Carrier");
    await carrier.getByRole("button", { name: "Vendor Test Carrier" }).click();
    await carrier.getByLabel("Risk to link").selectOption({ label: "Vendor Test single carrier" });
    await carrier.getByRole("button", { name: "Link risk" }).click();
    await expect(carrier).toContainText("1 linked risk");

    // The risk names the vendor on the Risk Register.
    const riskRow = page.locator("section#risk-register tr", { hasText: "Vendor Test single carrier" });
    await expect(riskRow).toContainText("Vendors: Vendor Test Carrier");

    await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title = 'Vendor Test single carrier'`, [WORKSPACE]);
    await page.reload();
    await expect(vendor(page, "Vendor Test Carrier")).toBeVisible();
    await expect(vendor(page, "Vendor Test Carrier")).not.toContainText("linked risk");
  });
});
