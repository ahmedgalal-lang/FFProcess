import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeWideProcess, removeWideProcess, WIDE_PROCESS_ID } from "../fixtures/wide-process";

/**
 * The interactive Process Map has to be readable when you open it.
 *
 * Reported with a screenshot as "very hard to read and lines are all over the
 * place". The lines turned out to be fine — the routing measures zero card
 * crossings and zero overlapping pairs on this same fixture. What was wrong
 * was the view: a spatial drawing was being laid out inside the page's
 * reading column, so a 25-step process was fitted to 11% zoom, and the box it
 * sat in reserved the full height of its lane stack, leaving the drawing a
 * band floating in the middle of a mostly empty rectangle. At that size every
 * connector is a hairline running off the edge, which is what "all over the
 * place" looks like.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(makeWideProcess);
test.afterAll(removeWideProcess);

async function openMap(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes/${WIDE_PROCESS_ID}/map`);
  await page.waitForSelector(".react-flow__edge-path");
  await page.waitForTimeout(2000);
}

test("opens at a zoom a card can be read at", async ({ page }) => {
  await openMap(page);
  const zoom = await page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>(".react-flow__viewport")!;
    return new DOMMatrix(getComputedStyle(vp).transform).a;
  });
  // Was 0.114 — a card's 13px label drawn at about 1.5px.
  expect(zoom, "the map opened too small to read").toBeGreaterThanOrEqual(0.4);
});

test("gives the drawing the width of the page, not of a paragraph", async ({ page }) => {
  await openMap(page);
  const width = await page.evaluate(
    () => document.querySelector(".react-flow")!.getBoundingClientRect().width
  );
  // Was 848px — the reading column the prose on this page uses.
  expect(width, "the canvas is still confined to the reading column").toBeGreaterThan(1100);
});

test("the page itself does not scroll sideways", async ({ page }) => {
  await openMap(page);
  const { scrollW, clientW } = await page.evaluate(() => {
    window.scrollTo(0, 0);
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
  // Widening the canvas must not push the page itself off its own edge.
  expect(scrollW).toBeLessThanOrEqual(clientW);
});

test("the prose on the page keeps its reading width", async ({ page }) => {
  await openMap(page);
  const width = await page.evaluate(() => {
    const heading = document.querySelector("main h1")!;
    return heading.parentElement!.parentElement!.getBoundingClientRect().width;
  });
  // The page got wider for the map's sake; the text must not have.
  expect(width, "the prose was widened along with the map").toBeLessThanOrEqual(900);
});
