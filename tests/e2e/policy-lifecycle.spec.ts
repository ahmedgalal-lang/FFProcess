import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Policy Lifecycle (spec 018): a policy moves Draft -> In Review -> Approved
 * -> Published -> Retired, with a full version history and a hard rule that
 * editing an Approved/Published policy resets it to Draft. Review-due dates
 * and acknowledgement tracking build on top.
 *
 * The FR-010 regeneration-safety guarantee (quickstart.md Scenario 2) is not
 * exercised here — it needs a real AI-drafted policy, and this deployment has
 * no GEMINI_API_KEY to generate one against (same constraint documented in
 * governance-assessment.spec.ts). It is fully covered at the integration
 * level instead (tests/integration/governance.test.ts's FR-010 test).
 *
 * Signed in as the seeded Firm Owner throughout, per every other governance
 * e2e test in this suite — the Firm Owner carve-out already grants ADMIN, so
 * one session covers both the EDITOR-level submit step and the ADMIN-level
 * approve/publish/retire steps. EDITOR-vs-ADMIN gating itself is covered at
 * the integration level (governance.test.ts).
 */
const WORKSPACE = "workspace-acme";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Cleans up whatever a failed run of these tests might have left behind. */
async function cleanupTestDebris() {
  await withClient(async (c) => {
    await c.query(`DELETE FROM governance_policy_drafts WHERE "workspaceId" = $1 AND title LIKE 'Lifecycle Test%'`, [
      WORKSPACE,
    ]);
  });
}

async function openGovernance(page: import("@playwright/test").Page) {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);
}

test.describe("policy lifecycle", () => {
  test.beforeEach(cleanupTestDebris);
  test.afterEach(cleanupTestDebris);

  test("moves a policy from draft through published, with a full version history, and resets to draft on a post-publish edit", async ({
    page,
  }) => {
    await openGovernance(page);

    await page.getByRole("button", { name: "+ Add policy" }).click();
    await page.getByPlaceholder("Policy title").fill("Lifecycle Test Policy");
    await page.getByPlaceholder(/The policy itself/).fill("1. Purpose\n2. Scope");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.getByRole("button", { name: /Lifecycle Test Policy/ });
    await expect(row).toBeVisible();
    await row.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Draft", { exact: true })).toBeVisible();

    // Draft -> In Review
    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await expect(dialog.getByText("In Review", { exact: true })).toBeVisible();

    // In Review -> Approved
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(dialog.getByText("Approved", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Approved by/)).toBeVisible();

    // Approved -> Published
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(dialog.getByText("Published", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Effective/)).toBeVisible();

    // Version history: one version so far.
    await dialog.getByRole("button", { name: /version history \(1\)/i }).click();
    await expect(dialog.getByText(/v1 —/)).toBeVisible();

    // Editing a Published policy resets it to Draft and adds a version.
    await dialog.getByRole("button", { name: "Edit" }).click();
    await dialog.locator("textarea").fill("1. Purpose\n2. Scope\n3. A revision after publishing.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText("Draft", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/version history \(2\)/i)).toBeVisible();

    // Re-publish, then retire.
    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await dialog.getByRole("button", { name: "Approve" }).click();
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(dialog.getByText("Published", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Retire" }).click();
    await expect(dialog.getByText("Retired", { exact: true })).toBeVisible();
  });

  test("flags a published policy overdue for review, and clears the flag once the date moves forward", async ({
    page,
  }) => {
    await openGovernance(page);

    await page.getByRole("button", { name: "+ Add policy" }).click();
    await page.getByPlaceholder("Policy title").fill("Lifecycle Test Review Policy");
    await page.getByPlaceholder(/The policy itself/).fill("Body text.");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.getByRole("button", { name: /Lifecycle Test Review Policy/ });
    await row.click();
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await dialog.getByRole("button", { name: "Approve" }).click();
    await dialog.getByRole("button", { name: "Publish" }).click();

    await dialog.locator("#policy-review-due").fill("2020-01-01");
    await dialog.getByRole("button", { name: "Set", exact: true }).click();
    await expect(dialog.getByText("Needs review")).toBeVisible();
    await expect(page.getByRole("button", { name: /Lifecycle Test Review Policy/ }).getByText("Needs review")).toBeVisible();

    await dialog.locator("#policy-review-due").fill("2099-01-01");
    await dialog.getByRole("button", { name: "Set", exact: true }).click();
    await expect(dialog.getByText("Needs review")).toHaveCount(0);
  });

  test("tracks acknowledgement against the People directory, only once published", async ({ page }) => {
    await openGovernance(page);

    await page.getByRole("button", { name: "+ Add policy" }).click();
    await page.getByPlaceholder("Policy title").fill("Lifecycle Test Ack Policy");
    await page.getByPlaceholder(/The policy itself/).fill("Body text.");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.getByRole("button", { name: /Lifecycle Test Ack Policy/ });
    await row.click();
    const dialog = page.getByRole("dialog");

    // Not offered before publishing.
    await expect(dialog.getByText("Acknowledged by")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await dialog.getByRole("button", { name: "Approve" }).click();
    await dialog.getByRole("button", { name: "Publish" }).click();

    await expect(dialog.getByText("Acknowledged by")).toBeVisible();
    const firstMark = dialog.getByRole("button", { name: "Mark acknowledged" }).first();
    await firstMark.click();
    await expect(dialog.getByRole("button", { name: "Unmark" }).first()).toBeVisible();

    await dialog.getByRole("button", { name: "Unmark" }).first().click();
    await expect(dialog.getByRole("button", { name: "Mark acknowledged" }).first()).toBeVisible();
  });
});
