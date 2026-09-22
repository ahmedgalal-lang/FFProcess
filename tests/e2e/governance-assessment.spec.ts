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
