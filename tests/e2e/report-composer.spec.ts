import "dotenv/config";
import { Client } from "pg";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The Report Composer lets a consultant choose which parts of the pack appear
 * and in what order, saved against one client.
 *
 * The first test here is not about the feature at all — it is the safety net
 * for building it. Making the report arrangeable meant restructuring a
 * 1,092-line component whose sections were a fixed sequence of JSX. A
 * restructuring like that can change output nobody asked to change, and the
 * people who would notice are clients receiving a pack that no longer matches
 * the last one.
 *
 * A snapshot was captured from the renderer *before* any of this work and
 * diffed against the restructured one. Exactly one line was removed — the
 * "3.1" that Governance used to print — and every added line was a section
 * number, a section or block title, or a "no data yet" marker. Both are
 * intended: Governance is now a section in its own right so it can be
 * reordered, and an empty section no longer vanishes. Nothing else changed,
 * which is what the restructuring had to prove.
 *
 * The snapshot below is the post-restructuring one, and now guards against
 * the next change rather than this one.
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

/** Back to "nobody has arranged this client", which is the default report. */
async function clearArrangement() {
  await sql(`UPDATE workspaces SET "reportArrangement" = NULL`);
}

test.beforeEach(clearArrangement);
test.afterAll(clearArrangement);

/**
 * The pack's structure: its processes, its section numbers and titles, its
 * block titles and its empty markers — and nothing else.
 *
 * The first version of this captured the report's whole text, which made it
 * order-dependent on the rest of the suite: another spec adds a KPI to a
 * seeded process, and the snapshot then failed depending on what had run
 * before it. What this test is for is the *shape* of the default pack — that
 * restructuring the renderer did not drop, reorder or renumber a section — so
 * body content is exactly the part it should not be asserting.
 *
 * Reached through the picker rather than by typing the report URL, because the
 * report takes its processes from `?ids=` — going straight to `/reports/<id>`
 * produces a pack of nothing, which is a different document.
 */
const SECTION_TITLES = [
  "Cover page",
  "Org Structure",
  "Helicopter View",
  "Processes in This Report",
  "Executive Summary",
  "Process Map & Narrative",
  "RACI & Authority Matrix",
  "Governance, Controls & Metrics",
  "Process Purpose",
  "Trigger & Output",
  "Internal Roles",
  "External Entities",
  "Scope",
  "Workflow diagram",
  "Step narrative",
  "RACI grid",
  "Authority rules",
  "Key Control Points",
  "Operational KPIs & SLAs",
];

async function reportText(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(2000);
  return page.locator("main.report-paper").innerText();
}

async function reportOutline(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(2000);

  const text = await page.locator("main.report-paper").innerText();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        /^[A-Z]{3}\d{3}$/.test(l) || // a process code
        /^\d+\.\d+$/.test(l) || // a section or block number
        /^No data yet/.test(l) ||
        /Value Chain$/.test(l) ||
        SECTION_TITLES.includes(l)
    )
    .join("\n");
}

test("an un-arranged client renders the report it rendered before this feature", async ({
  page,
}) => {
  const expected = readFileSync("tests/fixtures/report-default.snapshot.txt", "utf8").trim();
  await signIn(page);
  expect(await reportOutline(page)).toBe(expected);
});

/** The arranging panel's rows, as "number title" in print order. */
async function arrangeRows(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll("section")].find((s) =>
      s.querySelector("h2")?.textContent?.includes("Inside each process")
    )!;
    return [...panel.querySelectorAll(":scope > div > div")].map((r) => {
      const spans = r.querySelectorAll("label span");
      return `${spans[0]?.textContent?.trim()} ${spans[1]?.textContent?.trim()}`;
    });
  });
}

async function openPicker(page: import("@playwright/test").Page, workspace = WORKSPACE) {
  await page.goto(`/workspaces/${workspace}/export`);
  await page.waitForSelector("text=Inside each process");
}

test("unticking a section removes it from every process and closes the numbering", async ({
  page,
}) => {
  await signIn(page);
  await openPicker(page);

  await page.getByRole("checkbox", { name: "Include Executive Summary" }).uncheck();
  await expect.poll(() => arrangeRows(page)).toContainEqual("1.0 Process Map & Narrative");

  const text = await reportText(page);
  expect(text).not.toContain("Executive Summary");
  expect(text).toContain("1.0\nProcess Map & Narrative");
});

test("unticking a block removes it and its siblings close up", async ({ page }) => {
  await signIn(page);
  await openPicker(page);

  await page.getByRole("checkbox", { name: "Include Trigger & Output" }).uncheck();
  await expect
    .poll(() => arrangeRows(page))
    .toEqual(expect.arrayContaining(["1.2 Internal Roles", "1.3 External Entities"]));
});

test("moving a section renumbers it and everything it passed", async ({ page }) => {
  await signIn(page);
  await openPicker(page);

  await page.getByRole("button", { name: /Move RACI & Authority Matrix earlier/ }).click();
  await page.getByRole("button", { name: /Move RACI & Authority Matrix earlier/ }).click();

  await expect.poll(() => arrangeRows(page)).toEqual([
    "1.0 RACI & Authority Matrix",
    "1.1 RACI grid",
    "1.2 Authority rules",
    "2.0 Executive Summary",
    "2.1 Process Purpose",
    "2.2 Trigger & Output",
    "2.3 Internal Roles",
    "2.4 External Entities",
    "3.0 Process Map & Narrative",
    "3.1 Scope",
    "3.2 Workflow diagram",
    "3.3 Step narrative",
    "4.0 Governance, Controls & Metrics",
    "4.1 Key Control Points",
    "4.2 Operational KPIs & SLAs",
  ]);

  // The document agrees with the screen — which is the whole promise.
  const text = await reportText(page);
  expect(text).toContain("1.0\nRACI & Authority Matrix");
  expect(text).toContain("3.0\nProcess Map & Narrative");
});

test("the authority rules travel with the RACI grid and cannot be moved alone", async ({ page }) => {
  await signIn(page);
  await openPicker(page);

  // No arrows of their own, and the row says why.
  await expect(page.getByRole("button", { name: /Move Authority rules/ })).toHaveCount(0);
  await expect(page.getByText("moves with RACI grid")).toBeVisible();

  // One press steps the pair over the Governance heading and seats it at the
  // start of that section — both halves, still adjacent, renumbered together.
  await page.getByRole("button", { name: /Move RACI grid later/ }).click();
  await expect
    .poll(() => arrangeRows(page))
    .toEqual(expect.arrayContaining(["4.1 RACI grid", "4.2 Authority rules"]));

  // And again: past Key Control Points, still as one unit.
  await page.getByRole("button", { name: /Move RACI grid later/ }).click();
  await expect
    .poll(() => arrangeRows(page))
    .toEqual(expect.arrayContaining(["4.2 RACI grid", "4.3 Authority rules"]));
});

test("an arrangement belongs to one client and survives", async ({ page }) => {
  await signIn(page);
  await openPicker(page);
  await page.getByRole("checkbox", { name: "Include Executive Summary" }).uncheck();
  await expect.poll(() => arrangeRows(page)).toContainEqual("1.0 Process Map & Narrative");

  // It is still there after leaving and coming back.
  await page.goto("/workspaces");
  await openPicker(page);
  await expect(page.getByRole("checkbox", { name: "Include Executive Summary" })).not.toBeChecked();
});

test("a ticked block with no data prints marked, and unticking removes it", async ({ page }) => {
  await signIn(page);
  await openPicker(page);

  // Seeded PUR101 records no KPIs, so the block is ticked and empty.
  await expect(page.getByRole("checkbox", { name: "Include Operational KPIs & SLAs" })).toBeChecked();
  expect(await reportText(page)).toContain("Operational KPIs & SLAs");

  await openPicker(page);
  await page.getByRole("checkbox", { name: "Include Operational KPIs & SLAs" }).uncheck();
  await expect.poll(async () => await reportText(page)).not.toContain("Operational KPIs & SLAs");
});

/** Every text run in a .pptx, flattened — pptxgenjs splits text per word. */
async function deckText(page: import("@playwright/test").Page): Promise<string> {
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  const href = await page.locator('a:has-text("Download PPTX")').getAttribute("href");
  const body = await (await page.request.get(href!)).body();

  // Unzipped with the system tool rather than a library: a .pptx is a zip,
  // and adding a dependency to read one in a test is more than the test is
  // worth.
  const file = join(tmpdir(), `ffprocess-deck-${Date.now()}.pptx`);
  writeFileSync(file, body);
  try {
    const xml = execFileSync("unzip", ["-p", file, "ppt/slides/slide*.xml"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // <a:t> runs are per-word, so whole-phrase greps fail unless the tags go.
    return xml.replace(/<[^>]+>/g, " ");
  } finally {
    rmSync(file, { force: true });
  }
}

test("the deck follows the arrangement too", async ({ page }) => {
  await signIn(page);

  expect(await deckText(page)).toContain("Governance");

  await openPicker(page);
  await page.getByRole("checkbox", { name: "Include Governance, Controls & Metrics" }).uncheck();
  await expect.poll(() => arrangeRows(page)).not.toContainEqual("4.0 Governance, Controls & Metrics");

  expect(await deckText(page)).not.toContain("Governance");
});
