import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import {
  makeLongProcess,
  makeShortProcess,
  removeLongProcess,
  removeShortProcess,
  LONG_PROCESS_ID,
  SHORT_PROCESS_ID,
} from "../fixtures/long-process";

/**
 * A long process map wraps onto several rows instead of being squeezed into
 * one and shrunk until nobody can read it.
 *
 * The seeded processes are all nine steps or fewer, so nothing in the fixtures
 * exercises this at all — the spec builds its own 22-step process, across three
 * roles with a roleless step and a branch that crosses a row boundary.
 *
 * The number that matters is the scale the drawing ends up at. One row of
 * full-size cards put a 22-step process at 0.39, which is about 5.7px of label
 * text on paper. These assert the wrap and the compact print card together get
 * it back to something a client can read.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(async () => {
  await makeLongProcess();
  await makeShortProcess();
});

test.afterAll(async () => {
  await removeLongProcess();
  await removeShortProcess();
});

/** The last React Flow on the page is the process map; the first is the org chart. */
async function mapInfo(page: import("@playwright/test").Page, processIds: string[]) {
  await page.goto(`/reports/${WORKSPACE}?${processIds.map((id) => `ids=${id}`).join("&")}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const flows = [...document.querySelectorAll(".react-flow")];
    const flow = flows[flows.length - 1];
    if (!flow) return null;
    const all = [...flow.querySelectorAll<HTMLElement>(".react-flow__node")];
    const id = (n: HTMLElement) => n.dataset["id"] ?? "";
    const lanes = all.filter((n) => id(n).startsWith("lane-"));
    const markers = all.filter((n) => id(n).startsWith("marker-"));
    // A wrapped map also carries its own furniture — the row label, the rule
    // that ends the row before it, and the short link to the next row. None
    // of it is a step.
    const FURNITURE = ["lane-", "marker-", "rowlabel-", "rowrule-", "stub-"];
    const steps = all.filter((n) => !FURNITURE.some((p) => id(n).startsWith(p)));
    const rect = flow.getBoundingClientRect();
    const transform = flow.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? "1");
    return {
      stepCount: steps.length,
      stepLabels: steps.map((n) => n.textContent?.trim() ?? ""),
      stepWidth: Math.round(steps[0]?.getBoundingClientRect().width ?? 0),
      laneLabels: lanes.map((n) => n.textContent?.trim() ?? ""),
      laneIds: lanes.map(id),
      markerText: markers.map((n) => n.textContent?.trim() ?? ""),
      rowLabels: all.filter((n) => id(n).startsWith("rowlabel-")).map((n) => n.textContent?.trim() ?? ""),
      rules: all.filter((n) => id(n).startsWith("rowrule-")).length,
      stubs: all.filter((n) => id(n).startsWith("stub-")).length,
      scale,
      outside: all.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.right > rect.right + 2 || r.left < rect.left - 2;
      }).length,
    };
  });
}

test("a long process wraps onto rows and stays readable", async ({ page }) => {
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  // Every step, once.
  expect(map.stepCount).toBe(22);
  expect(new Set(map.stepLabels).size).toBe(22);
  expect(map.outside).toBe(0);

  // More than one row: lane ids carry their row, so two rows means two prefixes.
  const rows = new Set(map.laneIds.map((id) => id.split("-")[1]));
  expect(rows.size).toBeGreaterThan(1);

  // The point of the exercise. One row of full-size cards scaled this to 0.39;
  // anything near that is the bug this feature exists to fix.
  expect(map.scale).toBeGreaterThan(0.7);
});

test("every row says which row it is, and the rows are ruled apart", async ({ page }) => {
  // Reported as "very confusing to read": the rows were divided by a dashed
  // lane edge that looks like part of the swimlane rather than the end of a
  // row, and nothing said which row you were on.
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  expect(map.rowLabels.length).toBeGreaterThan(1);
  expect(map.rowLabels[0]).toMatch(/Row\s*1\s*of\s*\d/i);
  expect(map.rowLabels[0]).toMatch(/steps\s*1[–-]\d/i);

  // One rule between each pair of rows, and none above the first.
  expect(map.rules).toBe(map.rowLabels.length - 1);

  // A short link at each end of every connection the wrap had to break. That
  // is one pair per crossing, not one pair per row boundary: this fixture has
  // an extra labelled branch that skips ahead and crosses a row of its own.
  expect(map.stubs).toBe(map.markerText.length);
  expect(map.stubs % 2).toBe(0);
  expect(map.stubs).toBeGreaterThanOrEqual((map.rowLabels.length - 1) * 2);
});

test("a short process does not wrap and is left as it was", async ({ page }) => {
  // Four steps. The compact print card fits six to a row, so every seeded
  // process with any steps at all is now long enough to wrap — which is why
  // this needs a fixture of its own rather than borrowing PUR101.
  await signIn(page);
  const map = (await mapInfo(page, [SHORT_PROCESS_ID]))!;

  // Unwrapped lanes are ids like "lane-<roleId>"; wrapped ones are
  // "lane-<row>-<roleId>", so a digit in that position means it wrapped.
  expect(map.laneIds.every((id) => !/^lane-\d+-/.test(id))).toBe(true);
  expect(map.markerText).toEqual([]);
});

test("every row carries its own labelled lanes", async ({ page }) => {
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  const byRow = new Map<string, string[]>();
  map.laneIds.forEach((id, i) => {
    const row = id.split("-")[1]!;
    byRow.set(row, [...(byRow.get(row) ?? []), map.laneLabels[i]!]);
  });

  expect(byRow.size).toBeGreaterThan(1);
  for (const [row, labels] of byRow) {
    expect(labels.length, `row ${row} has no lanes`).toBeGreaterThan(0);
    expect(labels.every((l) => l.length > 0), `row ${row} has an unlabelled lane`).toBe(true);
  }

  // A row must not reserve space for a lane it has no steps in: with four
  // distinct lanes across the process, no row should carry all four.
  const distinct = new Set(map.laneLabels);
  expect(distinct.size).toBeGreaterThanOrEqual(3);
  expect(Math.min(...[...byRow.values()].map((l) => l.length))).toBeLessThan(distinct.size);
});

test("a connection crossing a row is marked at both ends, keeping its label", async ({ page }) => {
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  expect(map.markerText.some((t) => /continues on row \d/.test(t))).toBe(true);
  expect(map.markerText.some((t) => /from row \d/.test(t))).toBe(true);

  // The fixture's branch carries a label; it travels with the marker rather
  // than being dropped with the line.
  expect(map.markerText.some((t) => t.includes("Escalate"))).toBe(true);
});

test("exporting the report does not move a single stored step position", async ({ page }) => {
  // The expensive failure this feature could cause: a consultant's hand-arranged
  // map rewritten by a decision made for print.
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
  await mapInfo(page, [LONG_PROCESS_ID]);
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
  // so it gets the same wrap but its own drawing. A slide is a different shape
  // from a page and wants a different number of rows: one row of 22 steps is
  // six or seven times wider than the box, so fitting it shrinks the steps to
  // nothing.
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
