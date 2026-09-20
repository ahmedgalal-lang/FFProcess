import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Print/PDF-specific defects reported live: the Org Chart's live zoom
 * controls (and PNG-export button) baked into the printed page — dead,
 * non-functional UI in a PDF — and two processes' banners landing on the
 * same page (a content-less umbrella process sharing a page with the next
 * process's content read as one process bleeding into another).
 */
test.describe("Export Report print layout", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Org Chart in the report has no live zoom controls or export button baked in", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    const orgSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Org Structure" }) });
    await expect(orgSection).toBeVisible();

    // The interactive OrgChartCanvas renders both of these; the static
    // report version must render neither — they're dead weight on a page
    // meant to be printed or saved as a PDF, not interacted with.
    await expect(orgSection.locator(".react-flow__controls")).toHaveCount(0);
    await expect(orgSection.getByRole("button", { name: /PNG/i })).toHaveCount(0);
  });

  test("Every process starts on its own page, even one with no content beyond its title", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    // PUR100 is the seeded umbrella program: no steps, no RACI, no scope —
    // nothing beyond its own title card. It still gets a page break of its
    // own, so the next process's content never lands on the same page.
    const pur100Section = page
      .locator("main > section")
      .filter({ hasText: "Procure-to-Pay Program" })
      .filter({ hasText: "Umbrella program grouping procurement sub-processes" });
    await expect(pur100Section).toHaveCount(1);
    await expect(pur100Section).toHaveClass(/print-page/);

    // Purchase-to-Pay (PUR101) has real content and keeps its own page break too.
    // Filtered by its own description rather than by "1.0 Executive Summary":
    // every process prints that heading now, including the empty ones, so the
    // old filter matched four sections and the class assertion had nothing
    // single to assert against.
    const pur101Section = page
      .locator("main > section")
      .filter({ hasText: "From purchase requisition through vendor payment" });
    await expect(pur101Section).toHaveCount(1);
    await expect(pur101Section).toHaveClass(/print-page/);
  });

  test("Spacing control retunes how much fits on a page, and never prints itself", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    // Everything in the report is sized in rem against a page fixed in
    // millimetres, so the root font size is the one knob that changes how much
    // lands on a page — in the preview and in the PDF the browser makes from it.
    const rootFontSize = () => page.evaluate(() => document.documentElement.style.fontSize);
    expect(await rootFontSize()).toBe("");

    await page.getByRole("button", { name: "Tight", exact: true }).click();
    await expect.poll(rootFontSize).toBe("85%");
    await expect(page.getByRole("button", { name: "Tight", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Roomy", exact: true }).click();
    await expect.poll(rootFontSize).toBe("108%");

    // Back to Default clears the override rather than pinning 100%, so the
    // document returns to whatever font size the reader's browser is set to.
    await page.getByRole("button", { name: "Default", exact: true }).click();
    await expect.poll(rootFontSize).toBe("");

    // The control is preview furniture, not part of the document: it sits in
    // the no-print toolbar, so it can't land in the printed pack.
    const toolbar = page.locator(".no-print").filter({ hasText: "Spacing" }).first();
    await expect(toolbar).toBeVisible();
  });
});

/**
 * Pagination, measured against a generated PDF rather than read off the
 * stylesheet.
 *
 * That distinction is the point of every test below. This problem came back
 * repeatedly because it was checked by reading the CSS, and CSS that looks
 * right can still paginate wrongly: `break-inside: avoid` on an element taller
 * than the page is simply ignored, and nothing in the declaration says so.
 *
 * Baseline, measured before this work: **13 pages, mean page usage 47%, six
 * pages under a third used, one at 6%.**
 */
const BASELINE_PAGES = 13;
const BASELINE_MEAN_USAGE = 0.47;

/**
 * The document's atomic blocks, as the browser will fragment them, plus where
 * the deliberate page breaks are.
 */
async function measureDocument(page: import("@playwright/test").Page) {
  await page.emulateMedia({ media: "print" });
  return page.evaluate(() => {
    const paper = document.querySelector(".report-paper") as HTMLElement;
    const base = paper.getBoundingClientRect().top + window.scrollY;

    const blocks: { id: string; height: number; forced: boolean; closing: boolean }[] = [];
    let n = 0;
    for (const section of document.querySelectorAll<HTMLElement>(".print-page")) {
      const forcedSection = section.classList.contains("print-break-before");
      const closing = /Thank you/.test(section.textContent ?? "");
      // A section's own top-level children are the units that flow; the
      // section itself is not, because a process document is several pages.
      const kids = [...section.children].filter(
        (k) => (k as HTMLElement).getBoundingClientRect().height > 2
      ) as HTMLElement[];
      const units = kids.length > 0 ? kids : [section];
      units.forEach((el, i) => {
        blocks.push({
          id: `b${n++}`,
          height: el.getBoundingClientRect().height,
          forced: forcedSection && i === 0,
          closing,
        });
      });
    }
    return { blocks, docHeight: paper.getBoundingClientRect().height, base };
  });
}

async function realPdfPageCount(page: import("@playwright/test").Page): Promise<number> {
  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
  });
  // A PDF's page count is the number of /Type /Page objects.
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

async function openTwoProcessReport(page: import("@playwright/test").Page) {
  const { processIdByCode } = await import("./seed-lookup");
  const ids = await Promise.all(["PUR101", "PUR102"].map((c) => processIdByCode(c)));
  await page.goto(`/reports/workspace-acme?${ids.map((i) => `ids=${i}`).join("&")}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3500);
}

test.describe("Export Report pagination", () => {
  // Which sections print is stored per workspace, and other specs in this suite
  // save their own arrangements. Pagination depends on what is actually on the
  // page, so this starts from the default rather than from whatever the last
  // spec happened to leave behind.
  test.beforeEach(async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await client.query(`UPDATE workspaces SET "reportArrangement" = NULL WHERE id = $1`, [
        "workspace-acme",
      ]);
    } finally {
      await client.end();
    }
  });

  test("fills its pages instead of giving each section one", async ({ page }) => {
    const { paginate } = await import("../../lib/domain/report-pagination");
    await signIn(page);
    await openTwoProcessReport(page);

    const { blocks } = await measureDocument(page);
    const result = paginate(blocks, {
      forcedBreakBefore: blocks.filter((b) => b.forced).map((b) => b.id),
    });

    // Pages that are short for a reason the spec requires (SC-001): the page
    // before a forced break stops early precisely because FR-002 makes the next
    // process document start a page, and the closing page is allowed its own
    // sheet by FR-012 when it cannot fit the one before.
    const forcedIds = new Set(blocks.filter((b) => b.forced).map((b) => b.id));
    const closingIds = new Set(blocks.filter((b) => b.closing).map((b) => b.id));
    const excluded = new Set<number>([0]); // the cover
    result.breaks.forEach((brk, i) => {
      if (brk.beforeBlockId && forcedIds.has(brk.beforeBlockId)) excluded.add(i);
      if (brk.beforeBlockId && closingIds.has(brk.beforeBlockId)) excluded.add(i + 1);
    });

    const counted = result.usage.filter((_, i) => !excluded.has(i));
    const mean = counted.reduce((a, b) => a + b, 0) / counted.length;

    expect(counted.length, "something left to measure").toBeGreaterThan(3);
    expect(mean, `mean usage (baseline ${BASELINE_MEAN_USAGE})`).toBeGreaterThanOrEqual(0.7);
    expect(Math.min(...counted), "the worst page").toBeGreaterThanOrEqual(0.4);
  });

  test("uses fewer pages than it used to", async ({ page }) => {
    await signIn(page);
    await openTwoProcessReport(page);
    const pages = await realPdfPageCount(page);
    expect(pages).toBeGreaterThan(0);
    expect(pages, `baseline was ${BASELINE_PAGES}`).toBeLessThan(BASELINE_PAGES);
  });

  test("never splits a card, a row or a diagram", async ({ page }) => {
    const { paginate, PRINT_PAGE_HEIGHT_PX } = await import("../../lib/domain/report-pagination");
    await signIn(page);
    await openTwoProcessReport(page);

    const { blocks } = await measureDocument(page);
    const result = paginate(blocks, {
      forcedBreakBefore: blocks.filter((b) => b.forced).map((b) => b.id),
    });

    // Nothing the report draws may be taller than a page — an element that is
    // cannot honour "do not break inside me", and the browser fragments it
    // wherever it lands. That is what cut the process map through its cards.
    expect(result.oversized, "blocks no break rule can keep whole").toEqual([]);

    const tallest = Math.max(...blocks.map((b) => b.height));
    expect(tallest, "tallest block against the page").toBeLessThanOrEqual(PRINT_PAGE_HEIGHT_PX);
  });

  test("agrees with the PDF about how many pages there are", async ({ page }) => {
    // The prediction the preview's markers are drawn from, held against the
    // real thing. Without this the preview is merely plausible.
    const { paginate } = await import("../../lib/domain/report-pagination");
    await signIn(page);
    await openTwoProcessReport(page);

    const { blocks } = await measureDocument(page);
    const predicted = paginate(blocks, {
      forcedBreakBefore: blocks.filter((b) => b.forced).map((b) => b.id),
    }).pageCount;
    const actual = await realPdfPageCount(page);

    expect(actual).toBeGreaterThan(0);
    expect(Math.abs(predicted - actual), `predicted ${predicted}, actual ${actual}`).toBeLessThanOrEqual(1);
  });

  test("loses nothing on the way", async ({ page }) => {
    // Every page-usage target here is trivially satisfied by dropping a
    // section, so this is the guard that makes the rest mean anything.
    await signIn(page);
    await openTwoProcessReport(page);

    const content = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h2, h3")].map((h) => h.textContent?.trim() ?? "");
      return {
        headings,
        processes: [...document.querySelectorAll(".print-break-before")].length,
        rows: document.querySelectorAll("tbody tr").length,
      };
    });

    expect(content.headings).toContain("Org Structure");
    expect(content.headings).toContain("Helicopter View");
    expect(content.headings.some((h) => /Purchase-to-Pay/.test(h))).toBe(true);
    expect(content.headings.some((h) => /Vendor Onboarding/.test(h))).toBe(true);
    // Cover plus one per process.
    expect(content.processes).toBe(3);
    expect(content.rows).toBeGreaterThan(0);
    // Section headings repeat once per process, which is correct — each
    // process document has its own "1.0 Executive Summary". What must not
    // happen is a process document appearing twice, or a pack section doing so.
    const execSummaries = content.headings.filter((h) => /^1\.0 Executive Summary/.test(h));
    expect(execSummaries).toHaveLength(2);
    for (const packSection of ["Org Structure", "Helicopter View", "Processes in This Report"]) {
      expect(content.headings.filter((h) => h === packSection)).toHaveLength(1);
    }
  });
});
