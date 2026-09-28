import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The governance activity feed (spec 019). Risks it creates are titled
 * "Activity Test …"; their log entries and any seeded ones are removed
 * afterwards.
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
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Activity Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_activity_log_entries WHERE "workspaceId" = $1 AND "entityLabel" LIKE 'Activity Test%'`, [WORKSPACE]);
}

const feed = (page: Page) => page.locator("section#activity-log");
async function openFeed(page: Page) {
  const toggle = feed(page).getByRole("button", { name: "Show activity" });
  if (await toggle.count()) await toggle.click();
}

test.describe("governance activity feed", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("records a risk's changes newest first, and still names it after it's deleted", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    const register = page.locator("section#risk-register");
    await register.getByRole("button", { name: "+ Add risk" }).click();
    await register.getByPlaceholder("Risk title").fill("Activity Test supplier failure");
    await register.getByPlaceholder("What could go wrong, and why it matters").fill("x");
    await register.getByRole("button", { name: "Add", exact: true }).click();

    const row = register.locator("tr", { hasText: "Activity Test supplier failure" });
    await row.getByLabel("Status: Activity Test supplier failure").selectOption("ACCEPTED");
    await openFeed(page);
    await expect(feed(page).locator("li").first()).toContainText("Status changed to Accepted");

    await row.getByRole("button", { name: "Delete risk: Activity Test supplier failure" }).click();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0);

    const entries = feed(page).locator('li[data-activity-entry="Activity Test supplier failure"]');
    await expect(entries).toHaveCount(3);
    await expect(entries.nth(0)).toContainText("Deleted");
    await expect(entries.nth(1)).toContainText("Status changed to Accepted");
    await expect(entries.nth(2)).toContainText("Added");
    await expect(entries.nth(0)).toContainText("Risk");
    // No way to edit or remove an entry.
    await expect(feed(page).locator("li button")).toHaveCount(0);
  });

  test("loads older entries 50 at a time", async ({ page }) => {
    const { rows } = await sql(`SELECT id FROM users WHERE email = 'ahmed.galal@forefront.consulting'`);
    const actor = rows[0].id;
    // Far in the future, so these are the newest entries whatever else exists.
    for (let i = 0; i < 55; i++) {
      await sql(
        `INSERT INTO governance_activity_log_entries (id, "workspaceId", "entityType", "entityId", "entityLabel", summary, "actorUserId", "createdAt")
         VALUES (gen_random_uuid()::text, $1, 'RISK', 'seeded', $2, 'Added', $3, now() + interval '100 years' + ($4 || ' seconds')::interval)`,
        [WORKSPACE, `Activity Test seeded ${String(i).padStart(2, "0")}`, actor, String(i)]
      );
    }
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);

    await expect(feed(page).locator("li")).toHaveCount(0); // collapsed until asked for
    await openFeed(page);
    const seeded = feed(page).locator('li[data-activity-entry^="Activity Test seeded"]');
    await expect(seeded).toHaveCount(50);
    await expect(seeded.first()).toHaveAttribute("data-activity-entry", "Activity Test seeded 54");

    await feed(page).getByRole("button", { name: "Load more" }).click();
    await expect(seeded).toHaveCount(55);
    await expect(seeded.last()).toHaveAttribute("data-activity-entry", "Activity Test seeded 00");
  });
});
