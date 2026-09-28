import "dotenv/config";
import { Client } from "pg";
import { rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Governance & Risk in the exported report (spec 020): the workspace's Risk
 * Register, Policy Library index and assessment summaries, as one pack
 * section between the Value Chain and the process body — in the printed
 * report and the PPTX deck, and toggleable from the arrangement panel.
 *
 * Seeds its own rows, prefixed "Report Test", on its own aspect, so it never
 * touches governance records another spec relies on.
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
  await sql(`DELETE FROM governance_risks WHERE "workspaceId" = $1 AND title LIKE 'Report Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_policy_drafts WHERE "workspaceId" = $1 AND title LIKE 'Report Test%'`, [WORKSPACE]);
  await sql(`DELETE FROM governance_aspects WHERE "workspaceId" = $1 AND name LIKE 'Report Test%'`, [WORKSPACE]);
  await sql(`UPDATE workspaces SET "reportArrangement" = NULL WHERE id = $1`, [WORKSPACE]);
}

async function seed() {
  const risk = `INSERT INTO governance_risks (id, "workspaceId", title, description, likelihood, impact, status, "handManaged", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, now(), now())`;
  await sql(risk, [WORKSPACE, "Report Test Closed Risk", "Already dealt with.", "HIGH", "CRITICAL", "CLOSED"]);
  await sql(risk, [WORKSPACE, "Report Test Open Risk", "Single supplier for a critical part.", "HIGH", "HIGH", "OPEN"]);

  const policy = `INSERT INTO governance_policy_drafts (id, "workspaceId", title, body, status, "handManaged", "lifecycleStatus", "effectiveDate", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, 'EDITED', true, $4, $5, now(), now())`;
  await sql(policy, [WORKSPACE, "Report Test Published Policy", "SECRET BODY TEXT", "PUBLISHED", "2026-06-01"]);
  await sql(policy, [WORKSPACE, "Report Test Draft Policy", "SECRET BODY TEXT", "DRAFT", null]);

  const aspect = await sql(
    `INSERT INTO governance_aspects (id, "workspaceId", name) VALUES (gen_random_uuid()::text, $1, 'Report Test Aspect') RETURNING id`,
    [WORKSPACE]
  );
  await sql(
    `INSERT INTO governance_assessments (id, "workspaceId", "aspectId", summary, "summaryHandEdited", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'Report Test summary: accountability is clear.', true, now(), now())`,
    [WORKSPACE, aspect.rows[0].id]
  );
}

async function openReport(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".report-paper");
}

async function deckText(page: import("@playwright/test").Page): Promise<string> {
  await openReport(page);
  const href = await page.locator('a:has-text("Download PPTX")').getAttribute("href");
  const body = await (await page.request.get(href!)).body();
  const file = join(tmpdir(), `ffprocess-gov-deck-${Date.now()}.pptx`);
  writeFileSync(file, body);
  try {
    const xml = execFileSync("unzip", ["-p", file, "ppt/slides/slide*.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  } finally {
    rmSync(file, { force: true });
  }
}

test.describe("Governance & Risk in the exported report", () => {
  test.beforeEach(async () => {
    await cleanup();
    await seed();
  });
  test.afterEach(cleanup);

  test("prints the Risk Register, the policy index and the assessment summaries, before the process body", async ({
    page,
  }) => {
    await signIn(page);
    await openReport(page);
    const text = await page.locator("main.report-paper").innerText();

    const at = (s: string) => text.indexOf(s);
    expect(at("Governance & Risk")).toBeGreaterThan(at("Value Chain"));
    expect(at("Governance & Risk")).toBeLessThan(at("Processes in This Report"));

    const section = page.locator("section", { has: page.getByRole("heading", { name: "Governance & Risk", level: 2 }) });

    // Open before closed, whatever their levels.
    const risks = section.locator("tbody").first();
    await expect(risks.locator("tr").first()).toContainText("Report Test Open Risk");
    await expect(risks.locator("tr", { hasText: "Report Test Open Risk" })).toContainText("High");
    await expect(risks.locator("tr", { hasText: "Report Test Open Risk" })).toContainText("Unassigned");

    await expect(section.locator("tr", { hasText: "Report Test Published Policy" })).toContainText("Published");
    await expect(section.locator("tr", { hasText: "Report Test Published Policy" })).toContainText("1 Jun 2026");
    await expect(section.locator("tr", { hasText: "Report Test Draft Policy" })).toContainText("—");
    await expect(section).not.toContainText("SECRET BODY TEXT");

    await expect(section.getByRole("heading", { name: "Report Test Aspect" })).toBeVisible();
    await expect(section).toContainText("Report Test summary: accountability is clear.");
  });

  test("is in the deck too, and unticking it removes it from both formats", async ({ page }) => {
    await signIn(page);
    expect(await deckText(page)).toMatch(/Report Test Open Risk/);

    await page.goto(`/workspaces/${WORKSPACE}/export`);
    const box = page.getByRole("checkbox", { name: "Include Governance & Risk" });
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect
      .poll(async () => {
        const r = await sql(`SELECT "reportArrangement" FROM workspaces WHERE id = $1`, [WORKSPACE]);
        const pack = (r.rows[0]?.reportArrangement?.pack ?? []) as { id: string; on: boolean }[];
        return pack.find((s) => s.id === "governance")?.on;
      })
      .toBe(false);

    await openReport(page);
    await expect(page.getByRole("heading", { name: "Governance & Risk", level: 2 })).toHaveCount(0);
    expect(await deckText(page)).not.toMatch(/Report Test Open Risk/);
  });
});
