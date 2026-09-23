import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

const WORKSPACE = "workspace-acme";

/**
 * The AI-assisted governance assessment (spec 012-governance-generator): a
 * profile gate, a "not configured" message rather than a silent no-op or a
 * generic error when GEMINI_API_KEY is unset (FR-010 — the same state this
 * whole test environment runs in), and the Risk Register accepting a
 * hand-added entry independent of any assessment run (FR-011/FR-012).
 *
 * Regeneration's reconciliation rule (a DONE/DISMISSED item never reappears,
 * an edited policy or a hand-scored risk is never overwritten) is proven at
 * the action layer, against a mocked model response, in
 * tests/integration/governance.test.ts — that needs a controllable AI
 * response, which only a mocked module gives; a live model call is not
 * available in this environment, so it cannot be driven through the browser.
 */

async function clearProfile() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(
      `UPDATE workspaces SET industry = NULL, "governanceCompanySize" = NULL, "governanceJurisdiction" = NULL WHERE id = $1`,
      [WORKSPACE]
    );
    await client.query(`DELETE FROM governance_risks WHERE "workspaceId" = $1`, [WORKSPACE]);
    await client.query(`DELETE FROM governance_policy_drafts WHERE "workspaceId" = $1`, [WORKSPACE]);
    // Checklist items cascade-delete with their assessment; nothing in this
    // file ever calls the real model (GEMINI_API_KEY is unset here), so every
    // assessment row still around is one a hand-add test left behind.
    await client.query(`DELETE FROM governance_assessments WHERE "workspaceId" = $1`, [WORKSPACE]);
  } finally {
    await client.end();
  }
}

async function setIndustry(industry: string) {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET industry = $2 WHERE id = $1`, [WORKSPACE, industry]);
  } finally {
    await client.end();
  }
}

test.beforeEach(clearProfile);
test.afterAll(clearProfile);

test("without a profile, Generate is disabled and says why", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await expect(
    page.getByText("Set this workspace's company size, industry, and jurisdiction above before generating an assessment.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate assessment" })).toBeDisabled();
});

test("saving company size and jurisdiction, with industry already set, clears the profile gate", async ({ page }) => {
  await setIndustry("Manufacturing");
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await page.getByLabel("Jurisdiction").fill("United States (DE)");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saving…")).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Generate assessment" })).toBeEnabled();
  await expect(
    page.getByText("Set this workspace's company size, industry, and jurisdiction above before generating an assessment.")
  ).toHaveCount(0);

  // Reload: the saved profile persisted, not just the in-memory form state.
  await page.reload();
  await expect(page.getByLabel("Jurisdiction")).toHaveValue("United States (DE)");
  await expect(page.getByRole("button", { name: "Generate assessment" })).toBeEnabled();
});

test("generating with GEMINI_API_KEY unset shows the AI-unavailable message, not a silent no-op", async ({ page }) => {
  await setIndustry("Manufacturing");
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await page.getByLabel("Jurisdiction").fill("EU (IE)");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("button", { name: "Generate assessment" })).toBeEnabled();

  await page.getByRole("button", { name: "Generate assessment" }).click();
  await expect(page.getByText(/isn.t configured for this deployment yet/i)).toBeVisible();

  // Still the empty state — no assessment was fabricated or partially saved.
  await expect(page.getByText(/No assessment generated yet/)).toBeVisible();
});

test("a checklist item can be added by hand from the empty state, edited, and deleted", async ({ page }) => {
  // Reported alongside the policy gap: the checklist could only ever hold
  // what an AI run had generated, so a focus area nobody had generated yet —
  // or ever would, on a deployment with no model configured — had nowhere to
  // put a governance action a consultant already knew about.
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await expect(page.getByText(/No assessment generated yet/)).toBeVisible();
  await page.getByRole("button", { name: "+ Add a checklist item by hand" }).click();
  await page.getByPlaceholder("Action title").fill("Schedule a penetration test");
  await page.getByPlaceholder("What to do, and why it matters").fill("Nothing today tests the perimeter.");
  await page.getByLabel("When").selectOption("NEAR_TERM");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The empty state is gone, replaced by the checklist with the new item
  // filed under the phase it was given.
  await expect(page.getByText(/No assessment generated yet/)).toHaveCount(0);
  await expect(page.getByText("Schedule a penetration test")).toBeVisible();

  // Editing changes the text and can move it to a different phase column —
  // status is untouched by this, unlike Dismiss/Mark done.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Action title").fill("Commission a third-party penetration test");
  await page.getByLabel("When").selectOption("IMMEDIATE");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Commission a third-party penetration test")).toBeVisible();
  await expect(page.getByText("Schedule a penetration test")).toHaveCount(0);

  // Deleting removes it outright — distinct from Dismiss, which keeps it.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Commission a third-party penetration test")).toHaveCount(0);
});

test("a hand-added risk appears in the Risk Register with its derived level, independent of any assessment", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await page.getByRole("button", { name: "+ Add risk" }).click();
  await page.getByPlaceholder("Risk title").fill("Single supplier for critical components");
  await page
    .getByPlaceholder("What could go wrong, and why it matters")
    .fill("No qualified backup vendor exists for the primary machined-parts supplier.");
  await page.getByLabel("Likelihood").selectOption("HIGH");
  await page.getByLabel("Impact").selectOption("HIGH");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.locator("tr", { hasText: "Single supplier for critical components" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Added manually");
  await expect(row.getByText("HIGH", { exact: true })).toBeVisible(); // the derived level chip
});

test("a policy can be written, edited and deleted by hand, with no assessment behind it", async ({ page }) => {
  // Reported as "the policy part doesn't have anything, no add, no edit,
  // nothing": the library could only show what an assessment had drafted, so
  // with no assessment run it was empty with no way to put anything in it.
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  await page.getByRole("button", { name: "+ Add policy" }).click();
  await page.getByPlaceholder("Policy title").fill("Data Retention Policy");
  await page
    .getByPlaceholder(/The policy itself/)
    .fill("1. Purpose\n2. Retention periods\n3. Deletion and destruction");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.getByRole("button", { name: /Data Retention Policy/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Added manually");

  // Opening it shows the document, and it can be edited from there.
  await row.click();
  const drawer = page.getByRole("dialog", { name: "Data Retention Policy" });
  await expect(drawer).toContainText("Retention periods");
  await drawer.getByRole("button", { name: "Edit" }).click();
  await drawer.getByLabel("Policy title").fill("Records Management Policy");
  await drawer.getByRole("button", { name: "Save" }).click();

  // The rename reaches the library behind the still-open drawer.
  const renamed = page.getByRole("dialog", { name: "Records Management Policy" });
  await expect(renamed).toBeVisible();
  await expect(page.getByRole("button", { name: /Records Management Policy/ })).toBeVisible();

  // And deleting it, from the drawer, takes it out of the library.
  await renamed.getByRole("button", { name: "Delete" }).click();
  await renamed.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/No policies yet/)).toBeVisible();
});

test("the two focus areas added after the first five are offered as tabs", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/governance`);

  const tabs = page.getByRole("tablist", { name: "Governance focus area" });
  await expect(tabs.getByRole("tab", { name: "Data Integrity" })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Accessibility" })).toBeVisible();

  // Transparency and Fairness now read as one pillar, not two.
  await expect(page.getByText("Evaluated against four pillars")).toBeVisible();
  await expect(page.getByText("Transparency & Fairness", { exact: true })).toBeVisible();
});
