import "dotenv/config";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/**
 * Each aspect's governing policy (spec 029), following the quickstart. The
 * seeded workspace has no governing policies, so every one this test makes
 * is removed afterwards, along with the library policy it seeds.
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
  await sql(
    `DELETE FROM governance_policy_drafts WHERE "workspaceId" = $1 AND ("governsAspectId" IS NOT NULL OR title LIKE 'GP Test%')`,
    [WORKSPACE]
  );
}

const tabs = (page: Page) => page.getByRole("tablist", { name: "Governance focus area" });
const panel = (page: Page) => page.locator("section#governing-policy");

test.describe("governing policy per aspect", () => {
  test.beforeEach(cleanup);
  test.afterEach(cleanup);

  test("starts Board Structure's governing policy from the suggested template, and removes it again", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await tabs(page).getByRole("tab", { name: "Board Structure" }).click();

    await expect(panel(page)).toContainText("Board Structure has no governing policy yet.");
    const boardTab = tabs(page).getByRole("tab", { name: "Board Structure" });
    await expect(boardTab).toHaveAccessibleDescription("No published governing policy");

    await panel(page).getByRole("button", { name: "Start from template" }).click();
    const suggested = panel(page).getByRole("radio", { name: /^Board Charter\s+Suggested/ });
    await expect(suggested).toBeChecked();
    await panel(page).getByRole("button", { name: "Use template" }).click();

    await expect(panel(page).locator("[data-governing-policy]")).toHaveAttribute("data-governing-policy", "Board Charter");
    await expect(panel(page)).toContainText("Draft");
    await expect(panel(page)).toContainText("Not yet published");

    // It opens in the policy drawer, with the client's name filled in.
    await panel(page).getByRole("button", { name: "Board Charter" }).click();
    await expect(page.getByRole("dialog")).toContainText("Acme Industrial");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The library labels it, and the summary panel counts the ungoverned aspects.
    await expect(page.locator("#policy-library")).toContainText("Governs Board Structure");
    await expect(page.locator('li[data-tile="aspects-without-policy"]')).toBeVisible();

    const results = await new AxeBuilder({ page }).include("section#governing-policy").include("[role=tablist]").analyze();
    expect(results.violations).toEqual([]);

    await panel(page).getByRole("button", { name: "Remove as governing policy…" }).click();
    await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(panel(page)).toContainText("Board Structure has no governing policy yet.");
    const kept = await sql(`SELECT count(*)::int AS n FROM governance_policy_drafts WHERE "workspaceId" = $1 AND title = 'Board Charter'`, [WORKSPACE]);
    expect(kept.rows[0].n).toBe(1);
  });

  test("chooses an existing library policy as an aspect's governing policy", async ({ page }) => {
    await sql(
      `INSERT INTO governance_policy_drafts (id, "workspaceId", title, body, status, "handManaged", "lifecycleStatus", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'GP Test Risk Policy', '1. Purpose', 'EDITED', true, 'PUBLISHED', now(), now())`,
      [WORKSPACE]
    );
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await tabs(page).getByRole("tab", { name: "Risk & Internal Controls" }).click();

    await panel(page).getByRole("button", { name: "Choose from library" }).click();
    await panel(page).getByLabel("Policy from the library").selectOption({ label: "GP Test Risk Policy (Published)" });
    await panel(page).getByRole("button", { name: "Set as governing policy" }).click();

    await expect(panel(page).locator("[data-governing-policy]")).toHaveAttribute("data-governing-policy", "GP Test Risk Policy");
    await expect(panel(page)).toContainText("Published");
    // A Published governing policy clears the tab's marker.
    await expect(tabs(page).getByRole("tab", { name: "Risk & Internal Controls" })).not.toHaveAttribute("aria-describedby", /.+/);
  });
});
