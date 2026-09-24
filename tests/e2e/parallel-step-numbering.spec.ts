import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import {
  makeParallelStepProcess,
  removeParallelStepProcess,
  connectLegalToClient,
  PARALLEL_PROCESS_ID,
  PARALLEL_PROCESS_CODE,
} from "../fixtures/parallel-step-process";

/**
 * The reported follow-on to spec 015: two steps that both directly feed a
 * "requires all" step, with no path between them, read as consecutive whole
 * numbers today even though nothing about them is sequential (spec 016).
 * This drives the real Steps List and the printed report: a genuine
 * parallel pair letters as "2a"/"2b", the sequence continues correctly
 * afterward, and a real chain (one predecessor reachable from the other)
 * is never mislabeled as parallel.
 */
const WORKSPACE = "workspace-acme";

async function setLayout(layout: "FLOW" | "ROLES") {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET "reportMapLayout" = $2 WHERE id = $1`, [WORKSPACE, layout]);
  } finally {
    await client.end();
  }
}

async function openStepsList(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await page.locator("tr", { hasText: PARALLEL_PROCESS_CODE }).first().locator("text=Open").click();
  await page.waitForURL("**/map");
  await page.click('button:has-text("Steps List")');
}

async function printedMapText(page: import("@playwright/test").Page) {
  await page.goto(`/reports/${WORKSPACE}?ids=${PARALLEL_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");
  await page.waitForTimeout(600);
  return page.evaluate(() => (document.querySelector(".printed-map") as HTMLElement).innerText);
}

test.describe("parallel step numbering", () => {
  test.beforeEach(makeParallelStepProcess);
  test.afterAll(async () => {
    await removeParallelStepProcess();
    await setLayout("FLOW");
  });

  test("a genuine parallel pair letters on the Steps List, and the sequence continues after", async ({ page }) => {
    await signIn(page);
    await openStepsList(page);

    const legalRow = page.locator("div.rounded-xl", { hasText: "Legal sign-off" });
    const clientRow = page.locator("div.rounded-xl", { hasText: "Client sign-off" });
    const countersignRow = page.locator("div.rounded-xl", { hasText: "Countersign" });

    await expect(legalRow.locator("div.bg-indigo-50").first()).toHaveText("2a");
    await expect(clientRow.locator("div.bg-indigo-50").first()).toHaveText("2b");
    // The step after the pair reads the very next whole number — no gap.
    await expect(countersignRow.locator("div.bg-indigo-50").first()).toHaveText("3");
  });

  for (const layout of ["FLOW", "ROLES"] as const) {
    test(`${layout}: the same pair letters on the printed report`, async ({ page }) => {
      await setLayout(layout);
      await signIn(page);
      const text = await printedMapText(page);

      expect(text).toMatch(/2a[\s\S]*Legal sign-off/);
      expect(text).toMatch(/2b[\s\S]*Client sign-off/);
      expect(text).toContain("3");
      expect(text).not.toMatch(/\b2\b[\s\S]*Legal sign-off/); // never a bare "2"
    });
  }

  test("a real chain (one predecessor reachable from the other) is never mislabeled as parallel", async ({
    page,
  }) => {
    await connectLegalToClient();
    await signIn(page);
    await openStepsList(page);

    const legalRow = page.locator("div.rounded-xl", { hasText: "Legal sign-off" });
    const clientRow = page.locator("div.rounded-xl", { hasText: "Client sign-off" });
    const countersignRow = page.locator("div.rounded-xl", { hasText: "Countersign" });

    await expect(legalRow.locator("div.bg-indigo-50").first()).toHaveText("2");
    await expect(clientRow.locator("div.bg-indigo-50").first()).toHaveText("3");
    await expect(countersignRow.locator("div.bg-indigo-50").first()).toHaveText("4");
  });

  test("a requires-all step with only one predecessor keeps a plain number, no lone letter", async ({ page }) => {
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      // Drop the Client sign-off -> Countersign connection, leaving Countersign with one predecessor.
      await client.query(
        `DELETE FROM step_connections WHERE "processId" = $1 AND "fromStepId" = $2 AND "toStepId" = $3`,
        [PARALLEL_PROCESS_ID, `${PARALLEL_PROCESS_ID}-client`, `${PARALLEL_PROCESS_ID}-countersign`]
      );
    } finally {
      await client.end();
    }

    await signIn(page);
    await openStepsList(page);

    const legalRow = page.locator("div.rounded-xl", { hasText: "Legal sign-off" });
    await expect(legalRow.locator("div.bg-indigo-50").first()).toHaveText("2");
  });
});
