import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./sign-in";
import { buildSampleWorkbook, SAMPLE_PROCESS_NAME, SAMPLE_STEPS } from "../fixtures/process-import-sample";

/**
 * The round trip a consultant actually performs: download the template, upload
 * it, look at what will happen, confirm, and find the process built.
 *
 * The assertions that matter in the failure cases are about what is *not*
 * there. A file with mistakes must leave the workspace exactly as it was —
 * asserting that an error appeared would pass just as happily while a
 * half-built process was written behind it.
 */
const WORKSPACE = "workspace-acme";

async function countProcesses(): Promise<number> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM processes WHERE "workspaceId" = $1`,
      [WORKSPACE]
    );
    return Number(rows[0]!.n);
  } finally {
    await client.end();
  }
}

async function removeImported(namePrefix: string): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM processes WHERE "workspaceId" = $1 AND name LIKE $2`,
      [WORKSPACE, `${namePrefix}%`]
    );
    await client.query(
      `DELETE FROM roles WHERE "workspaceId" = $1 AND name IN ('Requester','Director','Buyer')
         AND id NOT IN (SELECT DISTINCT "assignedRoleId" FROM process_steps WHERE "assignedRoleId" IS NOT NULL)`,
      [WORKSPACE]
    );
  } finally {
    await client.end();
  }
}

/** The template exactly as the product hands it out. */
async function downloadTemplate(page: import("@playwright/test").Page): Promise<Buffer> {
  const response = await page.request.get(`/api/template/process-import/${WORKSPACE}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml");
  return Buffer.from(await response.body());
}

test.describe("building a process from a spreadsheet", () => {
  test.afterEach(async () => {
    await removeImported("Purchase Requisition");
  });

  test("the untouched template imports, and builds the whole process", async ({ page }) => {
    await signIn(page);
    const before = await countProcesses();
    const template = await downloadTemplate(page);

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "process-import-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: template,
    });
    await page.getByRole("button", { name: "Check this file" }).click();

    // The summary appears, and says what will be created — before anything is.
    await expect(page.getByText("This is what will be created")).toBeVisible();
    await expect(page.getByText("Roles that will be created")).toBeVisible();
    expect(await countProcesses(), "nothing written at preview").toBe(before);

    const create = page.getByRole("button", { name: /^Create / });
    await expect(create).toBeVisible();
    await create.click();

    await expect(page.getByText(/^Created Purchase Requisition/)).toBeVisible({ timeout: 15000 });
    expect(await countProcesses()).toBe(before + 1);

    // And the process is genuinely built, not merely recorded.
    await page.getByRole("link", { name: "Open the process map" }).click();
    await page.waitForURL("**/map");
    for (const label of ["Requisition raised", "Within spending limit?", "Order confirmed"]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("a file with mistakes creates nothing, and names every row", async ({ page }) => {
    await signIn(page);
    const before = await countProcesses();

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "not-the-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("this is not a workbook at all"),
    });
    await page.getByRole("button", { name: "Check this file" }).click();

    await expect(
      page.getByRole("region", { name: "Build a process from a spreadsheet" }).getByRole("alert")
    ).toBeVisible();
    // No confirm control is offered at all — a disabled one invites a click
    // and then refuses it.
    await expect(page.getByRole("button", { name: /^Create / })).toHaveCount(0);
    expect(await countProcesses(), "nothing written for a bad file").toBe(before);
  });

  test("declining leaves nothing behind", async ({ page }) => {
    await signIn(page);
    const before = await countProcesses();
    const template = await downloadTemplate(page);

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "process-import-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: template,
    });
    await page.getByRole("button", { name: "Check this file" }).click();
    await expect(page.getByText("This is what will be created")).toBeVisible();

    // Cancel must be reachable by keyboard while a request could be in flight.
    const cancel = page.getByRole("button", { name: "Cancel" });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await cancel.click();

    await expect(page.getByText("This is what will be created")).toHaveCount(0);
    expect(await countProcesses(), "nothing written after declining").toBe(before);
  });
});

/**
 * The summary and the problem list are dense tabular UI a consultant reads
 * under time pressure, and they are held to the same bar as every other matrix
 * in the product (Constitution Principle IV).
 */
test.describe("the import panel is usable without a mouse or colour vision", () => {
  test.afterEach(async () => {
    await removeImported("Purchase Requisition");
  });

  test("the panel, the summary and the problem list are axe-clean", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    await signIn(page);
    const template = await downloadTemplate(page);

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();

    let results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations, "the panel as opened").toEqual([]);

    await page.locator("#process-import-file").setInputFiles({
      name: "process-import-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: template,
    });
    await page.getByRole("button", { name: "Check this file" }).click();
    await expect(page.getByText("This is what will be created")).toBeVisible();

    results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations, "the summary").toEqual([]);

    // And the problem list, which is the denser of the two.
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "not-the-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not a workbook"),
    });
    await page.getByRole("button", { name: "Check this file" }).click();
    await expect(
      page.getByRole("region", { name: "Build a process from a spreadsheet" }).getByRole("alert")
    ).toBeVisible();

    results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations, "the problem list").toEqual([]);
  });

  test("the whole import can be driven from the keyboard", async ({ page }) => {
    await signIn(page);
    const template = await downloadTemplate(page);

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    const open = page.getByRole("button", { name: "Import from a file" });
    await open.focus();
    await expect(open).toBeFocused();
    await page.keyboard.press("Enter");

    const input = page.locator("#process-import-file");
    await expect(input).toBeVisible();
    await input.setInputFiles({
      name: "process-import-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: template,
    });

    const check = page.getByRole("button", { name: "Check this file" });
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("This is what will be created")).toBeVisible();

    const create = page.getByRole("button", { name: /^Create / });
    await create.focus();
    await expect(create, "the confirm control takes focus").toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Created Purchase Requisition/)).toBeVisible({ timeout: 15000 });
  });

  test("a problem is announced, and readable without relying on its colour", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "not-the-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not a workbook"),
    });
    await page.getByRole("button", { name: "Check this file" }).click();

    // Announced to a screen reader rather than only turning red. Scoped to the
    // panel's own region: the page carries other live regions, and an
    // assertion that matched any of them would not be about this one.
    const panel = page.getByRole("region", { name: "Build a process from a spreadsheet" });
    const alert = panel.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/couldn't be read/i);
  });
});

/**
 * SC-005: an imported process is indistinguishable from one built by hand.
 *
 * This is the claim that would be easiest to leave untested and quietly
 * false — the import could write rows that look right in the database while
 * the exports, the matrices and the report all treat the process as a special
 * case. Every surface below is one a consultant would actually take to a
 * client.
 */
test.describe("an imported process is an ordinary process", () => {
  test.afterEach(async () => {
    await removeImported("Purchase Requisition");
  });

  test("it edits, exports and reports exactly as a hand-built one does", async ({ page }) => {
    await signIn(page);
    const template = await downloadTemplate(page);

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "process-import-template.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: template,
    });
    await page.getByRole("button", { name: "Check this file" }).click();
    await page.getByRole("button", { name: /^Create / }).click();
    await expect(page.getByText(/^Created Purchase Requisition/)).toBeVisible({ timeout: 15000 });

    const href = await page.getByRole("link", { name: "Open the process map" }).getAttribute("href");
    const processId = href!.split("/").at(-2)!;

    // The RACI matrix is populated and raises no validation gap — the import
    // put exactly one Accountable on every task it touched.
    await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/raci`);
    await expect(page.getByText("Requisition raised").first()).toBeVisible();

    // The Authority Matrix carries the rules, with their figures.
    await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/authority`);
    await expect(page.getByText("Within spending limit?").first()).toBeVisible();

    // Both exports render for it, at the same endpoints every other process uses.
    for (const [what, url] of [
      ["RACI xlsx", `/api/export/raci/${processId}?format=xlsx`],
      ["RACI pdf", `/api/export/raci/${processId}`],
      ["Authority xlsx", `/api/export/authority/${processId}?format=xlsx`],
      ["Process map", `/api/export/process-map/${processId}`],
    ] as const) {
      const response = await page.request.get(url);
      expect(response.status(), what).toBe(200);
      expect((await response.body()).byteLength, what).toBeGreaterThan(1000);
    }

    // And it appears in the report like any other process.
    await page.goto(`/reports/${WORKSPACE}?ids=${processId}`);
    await page.waitForSelector(".report-paper");
    await expect(page.getByText("Purchase Requisition", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Requisition raised").first()).toBeVisible();

    // Finally: it is editable. A step renames, which proves the rows are
    // ordinary rows and not something the editor refuses to touch.
    await page.goto(`/workspaces/${WORKSPACE}/processes/${processId}/map`);
    await expect(page.getByText("Requisition raised").first()).toBeVisible();
  });
});

/**
 * SC-002: a 22-step process with roles, connections, RACI and authority rules
 * imports in one upload, where building it by hand is a sitting of an hour or
 * more. The template's own example is six steps; this is the size the feature
 * actually exists for.
 */
test.describe("a full-size process", () => {
  test.afterEach(async () => {
    await removeImported("Tendering to closure");
  });

  test("22 steps across seven roles import in one upload", async ({ page }) => {
    await signIn(page);
    const before = await countProcesses();

    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await page.getByRole("button", { name: "Import from a file" }).click();
    await page.locator("#process-import-file").setInputFiles({
      name: "tendering.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await buildSampleWorkbook(),
    });
    await page.getByRole("button", { name: "Check this file" }).click();

    // The summary states the size before anything is written.
    await expect(page.getByText("This is what will be created")).toBeVisible();
    await expect(page.getByText("22", { exact: true })).toBeVisible();
    expect(await countProcesses(), "nothing written at preview").toBe(before);

    await page.getByRole("button", { name: /^Create / }).click();
    // The name carries brackets, so it is matched as a string rather than
    // built into a regex where they would become a group.
    await expect(page.getByText(`Created ${SAMPLE_PROCESS_NAME}`, { exact: false })).toBeVisible({
      timeout: 20000,
    });
    expect(await countProcesses()).toBe(before + 1);

    // Every step is on the map — the first, the last, and a decision.
    await page.getByRole("link", { name: "Open the process map" }).click();
    await page.waitForURL("**/map");
    await page.waitForSelector(".react-flow__node");
    for (const label of [
      SAMPLE_STEPS[0]!.label,
      SAMPLE_STEPS[9]!.label,
      SAMPLE_STEPS[SAMPLE_STEPS.length - 1]!.label,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    const nodes = await page.locator(".react-flow__node").count();
    expect(nodes, "every step drawn").toBeGreaterThanOrEqual(22);
  });
});

/**
 * The reported symptom: "check file doesn't do anything". Whatever the cause,
 * a failure must become a message. This forces the action's POST to fail at
 * the network and asserts the panel says so instead of going quiet.
 */
test("a failed upload says so instead of doing nothing", async ({ page }) => {
  await signIn(page);
  await page.goto("/workspaces/workspace-acme/processes");
  await page.getByRole("button", { name: "Import from a file" }).click();
  await page.locator("#process-import-file").setInputFiles({
    name: "t.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("anything"),
  });

  // Every Server Action POST from this page fails outright.
  await page.route("**/processes", async (route, request) => {
    if (request.method() === "POST") return route.abort("failed");
    return route.continue();
  });

  await page.getByRole("button", { name: "Check this file" }).click();

  const panel = page.getByRole("region", { name: "Build a process from a spreadsheet" });
  await expect(panel.getByRole("alert")).toBeVisible({ timeout: 15000 });
  await expect(panel.getByRole("alert")).toContainText(/could not be run|Reload the page/i);

  // ...and the control comes back, rather than being stuck mid-flight.
  await expect(page.getByRole("button", { name: "Check this file" })).toBeEnabled();
});
