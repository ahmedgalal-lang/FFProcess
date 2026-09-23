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
 * "from row N" / "continues on row N" pill. The wrap wove rows from where each
 * step's card had been dragged on the canvas, on the theory that position "is"
 * the Steps List's own order. That is only true of a freshly auto-laid-out
 * process: dragging a card writes positionX/Y and nothing else, never the
 * step's place in the Steps List, so the two fall out of step on the first
 * edit — which is also why no earlier fixture in this suite caught it. Every
 * one of them lays steps out left to right in step order, because that is what
 * auto-layout does.
 *
 * The rows, their labels and the marker pills are all gone now: spec 013
 * rebuilt the printed map to run straight down the page. The guarantee they
 * were protecting is not gone, it just has a simpler shape — the numbers down
 * the page must read 1, 2, 3… however the cards were dragged. This fixture is
 * the only one in the suite that can catch it going wrong, so it stays.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(makeArrangedProcess);
test.afterAll(removeArrangedProcess);

test("a hand-arranged process still prints in step order, not canvas order", async ({ page }) => {
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${ARRANGED_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");

  const printed = await page.evaluate(() => {
    const map = document.querySelector(".printed-map")!;
    const rows = [...map.querySelectorAll<HTMLElement>(".pmap-flow__row, .pmap-roles__row")];
    return {
      numbers: rows.map((r) => Number(r.querySelector(".pmap-card__num")?.textContent?.trim())),
      // Read top to bottom, so a row's vertical position must ascend with it.
      tops: rows.map((r) => Math.round(r.getBoundingClientRect().top)),
      labels: rows.map((r) => r.querySelector(".pmap-card__label")?.textContent?.trim() ?? ""),
    };
  });

  expect(printed.numbers.length).toBeGreaterThan(1);

  // 1, 2, 3 … with no gap, no repeat and nothing running backwards — which is
  // exactly what "Steps 15-1" was.
  expect(printed.numbers).toEqual(printed.numbers.map((_, i) => i + 1));

  // And the page agrees with the numbering: step n+1 is always below step n.
  for (let i = 1; i < printed.tops.length; i++) {
    expect(
      printed.tops[i]!,
      `step ${i + 1} must be printed below step ${i}`
    ).toBeGreaterThanOrEqual(printed.tops[i - 1]!);
  }

  // Every step is present, each once.
  expect(new Set(printed.labels).size).toBe(printed.labels.length);
});

test("no connection is replaced by a marker the reader has to match up by eye", async ({ page }) => {
  // The other half of the same report: nearly every card carried a "from row
  // N" or "continues on row N" pill, because the wrap could not draw the line.
  // Running down the page, consecutive steps are adjacent, so those pills have
  // nothing left to stand in for and must not appear at all.
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${ARRANGED_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");

  const text = await page.locator(".printed-map").innerText();

  expect(text).not.toMatch(/continues on row/i);
  expect(text).not.toMatch(/from row \d/i);
  expect(text).not.toMatch(/runs right to left/i);
});
