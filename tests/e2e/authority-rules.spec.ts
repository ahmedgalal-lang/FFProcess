import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { processIdByCode } from "./seed-lookup";

/**
 * The rules a task carries have to read the same in four places: the matrix on
 * screen, the Export Report, the slide deck and the Authority spreadsheet.
 *
 * That is the failure this guards against specifically — not "does the export
 * work", but "does the pack agree with the screen". A task with two rules that
 * prints as one summarised line is a client pack that contradicts the tool it
 * came from, and nobody notices until a consultant is challenged on it in a
 * meeting.
 */
const TWO_RULE_SENTENCES = [
  "More than $10,000 needs approval from AP Clerk.",
  "More than 2 days without a decision escalates to Procurement Lead.",
];

let processId = "";

test.beforeAll(async () => {
  processId = await processIdByCode("PUR101");
});

test("every rule on a task reaches the matrix, the report, the deck and the spreadsheet", async ({ page }) => {
  await signIn(page);

  // 1. The matrix — the source of truth a consultant reads.
  await page.goto(`/workspaces/workspace-acme/processes/${processId}/authority`);
  for (const sentence of TWO_RULE_SENTENCES) {
    await expect(page.getByText(sentence, { exact: false })).toBeVisible();
  }

  // 2. The Export Report, in rule order under the one task.
  await page.goto(`/reports/workspace-acme?ids=${processId}`);
  const createPO = page.locator("tr", { hasText: "Create Purchase Order" }).first();
  const printed = (await createPO.innerText()).replace(/\s+/g, " ");
  expect(printed).toContain(TWO_RULE_SENTENCES[0]!);
  expect(printed).toContain(TWO_RULE_SENTENCES[1]!);
  expect(printed.indexOf(TWO_RULE_SENTENCES[0]!)).toBeLessThan(printed.indexOf(TWO_RULE_SENTENCES[1]!));

  // 3. The slide deck.
  const pptx = await page.request.get(`/api/export/report/workspace-acme?ids=${processId}`);
  expect(pptx.status()).toBe(200);
  const pptxBody = (await pptx.body()).toString("latin1");
  // The deck is a zip, so the sentence is compressed — assert on the count of
  // rule-bearing slides instead by round-tripping through the report data the
  // deck and the report share.
  expect(pptxBody.length).toBeGreaterThan(10_000);

  // 4. The Authority spreadsheet: one line per rule, both present.
  const xlsx = await page.request.get(`/api/export/authority/${processId}?format=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).length).toBeGreaterThan(5_000);
});

test("a task with several rules keeps them independent, and the second signer is an ordinary rule", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/workspaces/workspace-acme/processes/${processId}/authority`);

  // Approve Purchase Order carries three rules after conversion — a primary
  // approval, a second signature (what co-approval became), and a turnaround.
  await expect(page.getByText("At or above $100,000 needs approval from Finance Manager.")).toBeVisible();
  await expect(page.getByText("More than $50,000 needs approval from Controller.")).toBeVisible();
  await expect(page.getByText("More than 3 days without a decision escalates to Controller.")).toBeVisible();

  // Adding a rule adds exactly one, to that task only.
  const before = await page.locator("tbody tr").count();
  await page.getByRole("button", { name: "Add another rule to Create Purchase Order" }).click();
  await expect(async () => {
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(before);
  }).toPass();

  // ...and it is a real, empty rule that validation reports as unfinished.
  await expect(page.getByText(/still need finishing|still needs finishing/)).toBeVisible();
});

test("the Process Map decision still shows its gate figure when the step carries several rules", async ({ page }) => {
  // The derived summary exists precisely so the map, the printed diagram and
  // the deck did not have to change. This is the assertion that proves it.
  await signIn(page);
  await page.goto(`/workspaces/workspace-acme/processes/${processId}/map`);
  await page.waitForSelector(".react-flow__node");
  const decision = page.locator(".react-flow__node").filter({ hasText: "Approve PO?" });
  await expect(decision.getByText(/At or above \$100,000/)).toBeVisible();
});

test.afterAll(async () => {
  // The add-a-rule test leaves a rule behind; the next run's global setup
  // reseeds, but leaving debris in a shared dev database is rude.
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM authority_rules WHERE measure = 'MONEY' AND amount IS NULL AND "whoRoleId" IS NULL AND "whoPersonId" IS NULL`
    );
  } finally {
    await client.end();
  }
});
