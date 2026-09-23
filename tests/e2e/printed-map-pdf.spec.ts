import "dotenv/config";
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeTenderProcess, removeTenderProcess, TENDER_PROCESS_ID } from "../fixtures/tender-process";
import { makeWideProcess, removeWideProcess, WIDE_PROCESS_ID } from "../fixtures/wide-process";

/**
 * The map as it actually comes out of the PDF, rather than as it looks on
 * screen.
 *
 * Everything else measures the rendered DOM, which is the right surface for
 * most of the spec's criteria — but it cannot see paged media. Print applies
 * rules the screen never runs, and `break-inside: avoid` on eighteen rows is
 * exactly the kind of thing that behaves differently once the document is
 * genuinely paginating. A card torn in half across a page boundary would pass
 * every other test in this suite and still be the first thing a client noticed.
 *
 * So this exports the real PDF and reads it back: every step has to be in it,
 * and no row may straddle a page break.
 */
const WORKSPACE = "workspace-acme";

/** The tender fixture's eighteen steps, as they print. */
const STEP_LABELS = [
  "RFQ",
  "Evaluate the opportunity",
  "Rejected - Notify the requester with the rejection",
  "Accepted: CCO based on the SCOPE with the sector involved",
  "Technical clarification - overall evaluation",
  "Costing proposal - With targeted sector owner",
  "Internal resources evaluation and needs",
  "Internal Scenarios review",
  "Adjust and refine",
  "Call for a board meeting",
  "Internal final review",
  "Negotiation with client",
  "Letter of award from the client",
  "Contract Drafting",
  "Internationally - Outsourcing legal firm",
  "Sign contract - Ceramony",
  "Execution",
];

async function setLayout(layout: "FLOW" | "ROLES") {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET "reportMapLayout" = $1 WHERE id = $2`, [layout, WORKSPACE]);
  } finally {
    await client.end();
  }
}

async function exportPdf(page: import("@playwright/test").Page, processId: string) {
  await page.goto(`/reports/${WORKSPACE}?ids=${processId}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");

  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
  });

  const file = join(tmpdir(), `ffprocess-map-${Date.now()}.pdf`);
  writeFileSync(file, pdf);
  try {
    const pages = Number(
      /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file], { encoding: "utf8" }))?.[1] ?? "0"
    );
    // -layout keeps the reading order close to the visual one, which is what
    // makes "is every step here, in order" answerable at all.
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    const pageTexts = Array.from({ length: pages }, (_, i) =>
      execFileSync("pdftotext", ["-layout", "-f", String(i + 1), "-l", String(i + 1), file, "-"], {
        encoding: "utf8",
      })
    );
    return { pages, text, pageTexts };
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Whether any step's card was torn across a page boundary, read from the PDF
 * itself rather than inferred from the screen.
 *
 * An earlier version of this measured row geometry with print media emulated
 * and divided by the page height — and reported step 8 torn when the real PDF
 * had it whole on page 5. The arithmetic assumed page boundaries fall at exact
 * multiples of the page height from the top of the paper, which is not true of
 * this document: the report's own sections force breaks of their own, so
 * everything after one is offset by an amount that division cannot see.
 *
 * The PDF has no such ambiguity. A card renders as its label, then its meta
 * line directly beneath — role, SLA, and whatever else it carries — so a card
 * torn by a break is one whose label ends a page with its meta line stranded at
 * the top of the next.
 */
function cardsTornAcrossPages(pageTexts: string[]) {
  const torn: { label: string; page: number }[] = [];
  // What a card's second line always carries: its role, or the fact that it has
  // none, and its SLA.
  const META = /(no SLA set|SLA \d+d|No role set|[A-Z]{2,}[A-Z ]*)/;

  pageTexts.forEach((text, index) => {
    const lines = text.split("\n").map((l) => l.trimEnd());
    lines.forEach((line, i) => {
      // A card's first line is its step number then its label — matched against
      // the labels this fixture actually has, so the report's own index
      // ("1  TEN500  Tender to contract") is not mistaken for a step.
      const label = STEP_LABELS.find((l) => new RegExp(`^\\s*\\d{1,2}\\s{2,}${escapeRe(l)}`).test(line));
      if (!label) return;

      // Its meta line follows, allowing for a label that wrapped.
      const following = lines.slice(i + 1, i + 4).filter((l) => l.trim().length > 0);
      if (!following.some((l) => META.test(l))) {
        torn.push({ label, page: index + 1 });
      }
    });
  });

  return torn;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("the printed map, as it comes out of the PDF", () => {
  test.beforeAll(async () => {
    await makeTenderProcess();
  });

  test.afterAll(async () => {
    await removeTenderProcess();
    await setLayout("FLOW");
  });

  for (const layout of ["FLOW", "ROLES"] as const) {
    test(`${layout}: every step reaches the exported PDF`, async ({ page }) => {
      await setLayout(layout);
      await signIn(page);
      const { pages, text } = await exportPdf(page, TENDER_PROCESS_ID);

      expect(pages).toBeGreaterThan(0);

      // Each of the eighteen labels, in the real document. The long one is the
      // point: it is what overflowed its card on every previous version, and a
      // PDF is where a clipped card would finally be undeniable.
      // pdftotext wraps at the column width, so compare on collapsed whitespace.
      const flat = text.replace(/\s+/g, " ");
      for (const label of STEP_LABELS) {
        expect(flat, `"${label}" is missing from the exported PDF`).toContain(label);
      }
    });

    test(`${layout}: no step card is torn across a page break`, async ({ page }) => {
      await setLayout(layout);
      await signIn(page);
      const { pageTexts } = await exportPdf(page, TENDER_PROCESS_ID);

      const torn = cardsTornAcrossPages(pageTexts);
      expect(
        torn,
        `cards whose meta line was stranded on the next page:\n${JSON.stringify(torn, null, 2)}`
      ).toEqual([]);
    });
  }

  test("every map row is protected from being split by a page break", async ({ page }) => {
    // The companion to the PDF check above, and the one with teeth.
    //
    // The protection a row actually gets comes from the report's own
    // `.print-keep { break-inside: avoid; }` rule (export-preview.tsx), which
    // this component's own `break-inside: avoid` on `.pmap-flow__row` /
    // `.pmap-roles__row` duplicates. Removing this file's declaration alone
    // was measured and changed nothing in the exported PDF, because
    // `print-keep` still supplied it — which is why the outcome test above
    // cannot be trusted to catch a dropped rule by itself.
    //
    // This is the guard: the rule has to be *computed* on every row, in print
    // media, wherever it comes from. Mutation-checked by removing `print-keep`
    // from a row's class list, which this test caught (the outcome test above
    // did not, for the geometry reason above).
    await setLayout("FLOW");
    await signIn(page);
    await page.goto(`/reports/${WORKSPACE}?ids=${TENDER_PROCESS_ID}`);
    await page.waitForSelector(".printed-map");
    await page.emulateMedia({ media: "print" });

    const unprotected = await page.evaluate(() => {
      const rows = [
        ...document.querySelectorAll<HTMLElement>(".pmap-flow__row, .pmap-roles__row"),
      ];
      return {
        total: rows.length,
        offenders: rows
          .map((row) => ({
            step: row.querySelector(".pmap-card__num")?.textContent?.trim() ?? "?",
            breakInside: getComputedStyle(row).breakInside,
          }))
          .filter((r) => r.breakInside !== "avoid"),
      };
    });
    await page.emulateMedia({ media: "screen" });

    expect(unprotected.total, "the map drew no rows at all").toBeGreaterThan(10);
    expect(
      unprotected.offenders,
      `rows a page break is allowed to split:\n${JSON.stringify(unprotected.offenders, null, 2)}`
    ).toEqual([]);
  });

  test("the fallback above the role ceiling survives into the PDF", async ({ page }) => {
    await makeWideProcess();
    await setLayout("ROLES");
    await signIn(page);

    const { text } = await exportPdf(page, WIDE_PROCESS_ID);
    const flat = text.replace(/\s+/g, " ");

    expect(flat).toContain("Printed in the Flow layout");
    expect(flat).toMatch(/uses \d+ roles/);

    await removeWideProcess();
  });

  test("the whole pack is shorter than the map it replaced", async ({ page }) => {
    // The old map spanned four pages of a seven-page pack on this shape, and
    // was unreadable on every one of them. Page count was never the goal — a
    // legible map that ran longer would still have been the better deliverable
    // — so this records what actually happened rather than demanding a budget.
    await setLayout("FLOW");
    await signIn(page);
    const { pages } = await exportPdf(page, TENDER_PROCESS_ID);

    expect(pages).toBeGreaterThan(0);
    expect(pages, `the pack is ${pages} pages`).toBeLessThanOrEqual(10);
  });
});
