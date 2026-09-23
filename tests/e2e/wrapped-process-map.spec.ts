import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeLongProcess, removeLongProcess, LONG_PROCESS_ID } from "../fixtures/long-process";

/**
 * What is left of spec 007's wrapped process map, after spec 013 replaced the
 * one place it was visible.
 *
 * This file used to assert the report's serpentine map in detail: that rows
 * alternated direction and said so, that lane bands were dropped, that a
 * crossing connection was marked at both ends, that the seam between two row
 * groups was drawn. Spec 013 deleted every one of those mechanisms from the
 * report deliberately — they were the patches that made an 18-step process
 * print with all 18 labels cut off — so those tests went with them rather than
 * being kept green against something that no longer exists. The report's map is
 * measured instead in `printed-map.spec.ts`, against the rebuilt layouts.
 *
 * Three things here outlived that change and still matter:
 *
 *   - the PPTX deck still wraps its map serpentine, because a slide is a
 *     different shape from a page and was never the thing complained about;
 *   - the interactive canvas still does not wrap, which is the boundary the
 *     consultant asked for explicitly;
 *   - rendering the report still writes nothing back to a step's position.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(async () => {
  await makeLongProcess();
});

test.afterAll(async () => {
  await removeLongProcess();
});

test("exporting the report does not move a single stored step position", async ({ page }) => {
  // The expensive failure a print layout could cause: a consultant's
  // hand-arranged map rewritten by a decision made for print.
  const { Client } = await import("pg");
  const read = async () => {
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT id, "positionX", "positionY" FROM process_steps WHERE "processId" = $1 ORDER BY id`,
        [LONG_PROCESS_ID]
      );
      return JSON.stringify(rows);
    } finally {
      await client.end();
    }
  };

  const before = await read();
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${LONG_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(1500);

  expect(await read()).toBe(before);
});

test("the interactive Process Map is not wrapped", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes/${LONG_PROCESS_ID}/map`);
  await page.waitForSelector(".react-flow__node");
  await page.waitForTimeout(1500);

  const laneIds = await page.$$eval(".react-flow__node", (ns) =>
    ns.map((n) => (n as HTMLElement).dataset["id"] ?? "").filter((id) => id.startsWith("lane-"))
  );
  expect(laneIds.every((id) => !/^lane-\d+-/.test(id))).toBe(true);
  await expect(page.getByText(/continues on row/)).toHaveCount(0);
});

test("the slide deck carries every step of a long process too", async ({ page }) => {
  // The deck lays out its own slide rather than reusing the report's diagram,
  // so it keeps `wrapProcessMap` and keeps wrapping serpentine. A slide is a
  // different shape from a page and wants a different answer: one row of 22
  // steps is six or seven times wider than the box, so fitting it shrinks the
  // steps to nothing.
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${LONG_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  const href = await page.locator('a:has-text("Download PPTX")').getAttribute("href");
  const body = await (await page.request.get(href!)).body();

  const file = join(tmpdir(), `ffprocess-wrap-${Date.now()}.pptx`);
  writeFileSync(file, body);
  try {
    const xml = execFileSync("unzip", ["-p", file, "ppt/slides/slide*.xml"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // <a:t> runs are per-word, so the tags have to go before a phrase matches.
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const label of ["RFQ received", "Board meeting", "Change control", "Close-out"]) {
      expect(text, `deck is missing "${label}"`).toContain(label);
    }
    // Lanes are drawn per row, so a role appears more than once.
    expect((text.match(/PROCUREMENT LEAD|Procurement Lead/g) ?? []).length).toBeGreaterThan(1);
  } finally {
    rmSync(file, { force: true });
  }
});
