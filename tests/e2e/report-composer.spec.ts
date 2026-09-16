import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "node:fs";
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
 * The report's text, with the calendar normalised out.
 *
 * Reached through the picker rather than by typing the report URL, because the
 * report takes its processes from `?ids=` — going straight to `/reports/<id>`
 * produces a pack of nothing, which is a different document and would make
 * this snapshot assert the wrong thing.
 */
async function reportText(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/export`);
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(2000);
  return (await page.locator("main.report-paper").innerText())
    .replace(/\d{4}-\d{2}-\d{2}/g, "<date>")
    .replace(/-20\d\d\b/g, "-<year>")
    .replace(/\s+\n/g, "\n")
    .trim();
}

test("an un-arranged client renders the report it rendered before this feature", async ({
  page,
}) => {
  const expected = readFileSync("tests/fixtures/report-default.snapshot.txt", "utf8").trim();
  await signIn(page);
  expect(await reportText(page)).toBe(expected);
});
