import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/**
 * Conflicts of interest and training records (spec 021), following the
 * quickstart. Conflicts use related parties prefixed "CT Test", and courses
 * are named "CT Test …"; both are removed afterwards. People come from the
 * e2e global setup.
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
  await sql(`DELETE FROM conflicts_of_interest WHERE "workspaceId" = $1 AND "relatedParty" LIKE 'CT Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM training_courses WHERE "workspaceId" = $1 AND name LIKE 'CT Test%'`, [WORKSPACE]);
}

/** Today shifted by whole months then days, as YYYY-MM-DD (UTC). */
function isoDay(months: number, days = 0) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const conflicts = (page: Page) => page.locator("section#conflicts");
const training = (page: Page) => page.locator("section#training");

test.describe("conflicts of interest and training", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("records a conflict and follows it from Declared to Closed", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    await conflicts(page).getByRole("button", { name: "+ Record conflict" }).click();
    await conflicts(page).getByLabel("Person").selectOption({ label: "E2E Person One" });
    await conflicts(page).getByLabel("Related party").fill("CT Test Northwind Supplies");
    await conflicts(page).getByLabel("Date declared").fill(isoDay(0, -2));
    await conflicts(page).getByLabel("The interest").fill("Spouse is a director at a shortlisted vendor.");
    await conflicts(page).getByRole("button", { name: "Record conflict", exact: true }).click();

    const conflict = conflicts(page).locator(`li[data-conflict="E2E Person One – CT Test Northwind Supplies"]`);
    await expect(conflict).toContainText("Declared");
    await expect(conflicts(page).getByRole("heading", { name: /^Open \(\d+\)$/ })).toBeVisible();

    await conflict.getByRole("button", { name: /^Update/ }).click();
    await conflict.getByLabel("Status").selectOption("MITIGATED");
    await conflict.getByLabel("How it's being managed").fill("Recused from the vendor decision.");
    await conflict.getByRole("button", { name: "Save conflict" }).click();
    await expect(conflict).toContainText("Mitigated");
    await expect(conflict).toContainText("Recused from the vendor decision.");

    await conflict.getByRole("button", { name: /^Update/ }).click();
    await conflict.getByLabel("Status").selectOption("CLOSED");
    await conflict.getByRole("button", { name: "Save conflict" }).click();
    await expect(conflicts(page).getByRole("heading", { name: /^Closed \(\d+\)$/ })).toBeVisible();
    await expect(conflict).toContainText("Closed");
  });

  test("shows each completion's expiry state, and deleting a course says how many completions go", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    await training(page).getByRole("button", { name: "+ Add course" }).click();
    await training(page).getByLabel("Course name").fill("CT Test Anti-bribery");
    await training(page).getByLabel(/Valid for/).fill("12");
    await training(page).getByRole("button", { name: "Add course", exact: true }).click();

    const course = training(page).locator(`li[data-course="CT Test Anti-bribery"]`);
    await expect(course).toContainText("Valid for 12 months");

    const record = async (person: string, date: string) => {
      await course.getByLabel("Person who completed CT Test Anti-bribery").selectOption({ label: person });
      await course.getByLabel("Date CT Test Anti-bribery was completed").fill(date);
      await course.getByRole("button", { name: "Record completion" }).click();
      await expect(course.getByRole("row", { name: new RegExp(`${person} ${date}`) })).toBeVisible();
    };
    await record("E2E Person One", isoDay(0));
    await record("E2E Person Two", isoDay(-13));
    await record("E2E Person Three", isoDay(-12, 15));

    await expect(course.getByRole("row", { name: new RegExp(`E2E Person One ${isoDay(0)}`) })).toContainText("Current");
    await expect(course.getByRole("row", { name: new RegExp(`E2E Person Two ${isoDay(-13)}`) })).toContainText("Expired");
    await expect(course.getByRole("row", { name: new RegExp(`E2E Person Three ${isoDay(-12, 15)}`) })).toContainText("Expiring soon");

    // A course without a validity period never expires.
    await training(page).getByRole("button", { name: "+ Add course" }).click();
    await training(page).getByLabel("Course name").fill("CT Test Induction");
    await training(page).getByRole("button", { name: "Add course", exact: true }).click();
    const induction = training(page).locator(`li[data-course="CT Test Induction"]`);
    await expect(induction).toContainText("Never expires");
    await induction.getByLabel("Person who completed CT Test Induction").selectOption({ label: "E2E Person One" });
    await induction.getByLabel("Date CT Test Induction was completed").fill("2015-01-05");
    await induction.getByRole("button", { name: "Record completion" }).click();
    await expect(induction).toContainText("No expiry");

    const results = await new AxeBuilder({ page }).include("section#training").include("section#conflicts").analyze();
    expect(results.violations).toEqual([]);

    await course.getByRole("button", { name: /^Edit course/ }).click();
    await course.getByRole("button", { name: "Delete course…" }).click();
    await expect(course.getByRole("alert")).toHaveText("Delete CT Test Anti-bribery and its 3 completions?");
    await course.getByRole("button", { name: "Delete course", exact: true }).click();
    await expect(course).toHaveCount(0);
  });
});
