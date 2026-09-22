import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import {
  makeArrangedProcess,
  removeArrangedProcess,
  ARRANGED_PROCESS_ID,
} from "../fixtures/arranged-process";

/**
 * A printed map has to read in the order the process runs in, whatever the
 * canvas positions happen to be.
 *
 * Reported from production, with a screenshot: row labels reading "Steps
 * 2-5", "Steps 15-1", "Steps 7-16", "Steps 11-1" — overlapping,
 * non-contiguous, one of them descending — and nearly every card carrying a
 * "from row N" / "continues on row N" pill. The wrap wove rows from where
 * each step's card had been dragged on the canvas, on the theory that
 * position "is" the Steps List's own order. That is only true of a freshly
 * auto-laid-out process: dragging a card writes positionX/Y and nothing
 * else, never the step's place in the Steps List, so the two fall out of
 * step on the first edit — which is also why no earlier fixture in this
 * suite caught it. Every one of them lays steps out left to right in step
 * order, because that is what auto-layout does.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(makeArrangedProcess);
test.afterAll(removeArrangedProcess);

test("row labels are contiguous and ascending on a hand-arranged process", async ({ page }) => {
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${ARRANGED_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);

  const rowLabels = await page.evaluate(() => {
    const id = (n: Element) => n.getAttribute("data-id") ?? "";
    return [...document.querySelectorAll(".react-flow")]
      .slice(1)
      .flatMap((f) => [...f.querySelectorAll(".react-flow__node")])
      .filter((n) => id(n).startsWith("rowlabel-"))
      .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
  });

  const ranges = rowLabels.map((text) => {
    const m = /steps\s*(\d+)[–-](\d+)/i.exec(text);
    if (!m) throw new Error(`row label has no step range: "${text}"`);
    return [Number(m[1]), Number(m[2])] as const;
  });

  expect(ranges.length).toBeGreaterThan(1);

  // Every range counts up, never down — "Steps 15-1" is what this fixture
  // reproduced before the fix.
  for (const [first, last] of ranges) {
    expect(first, `a row's own range must not run backwards`).toBeLessThanOrEqual(last);
  }

  // And each row picks up exactly where the row before it left off — no gap,
  // no overlap.
  for (let i = 1; i < ranges.length; i++) {
    expect(ranges[i]![0], `row ${i + 1} does not continue from row ${i}`).toBe(ranges[i - 1]![1] + 1);
  }
  expect(ranges[0]![0]).toBe(1);
});

test("no connection between adjacent steps is broken into a cross-row marker", async ({ page }) => {
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${ARRANGED_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);

  // The fixture's own connections are a plain chain, step n to step n+1, and
  // now that rows are dealt in that same order, only a connection actually
  // crossing a row boundary in the process's own sequence should be marked —
  // at most one per row seam. Before the fix, twelve of the fifteen were.
  const markerCount = await page.evaluate(() => {
    const id = (n: Element) => n.getAttribute("data-id") ?? "";
    return [...document.querySelectorAll(".react-flow")]
      .slice(1)
      .flatMap((f) => [...f.querySelectorAll(".react-flow__node")])
      .filter((n) => id(n).startsWith("marker-")).length;
  });

  expect(markerCount, "far more connections were broken into markers than the process actually crosses").toBe(0);
});
