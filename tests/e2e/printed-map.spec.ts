import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeTenderProcess, removeTenderProcess, TENDER_PROCESS_ID } from "../fixtures/tender-process";
import { makeWideProcess, removeWideProcess, WIDE_PROCESS_ID } from "../fixtures/wide-process";

/**
 * The rebuilt printed map (spec 013), measured rather than eyeballed.
 *
 * Every assertion here is one of the spec's success criteria, and every number
 * it asserts is one that was measured on the *old* map before the rebuild, on
 * this same 18-step tender process: 18 of 18 cards with their label overflowing
 * the card, 1 card clipped by the box it was drawn in, 1 stub pointing into
 * empty page, and 2 of 4 rows running right to left. All of them must now be
 * zero, in both layouts.
 */
const WORKSPACE = "workspace-acme";

async function setLayout(workspaceId: string, layout: "FLOW" | "ROLES") {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET "reportMapLayout" = $2 WHERE id = $1`, [workspaceId, layout]);
  } finally {
    await client.end();
  }
}

/** What the rendered map actually is, read off the page. */
async function measureMap(page: import("@playwright/test").Page, processId: string) {
  await page.goto(`/reports/${WORKSPACE}?ids=${processId}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");
  await page.waitForTimeout(600);

  return page.evaluate(() => {
    const map = document.querySelector(".printed-map")!;
    const cards = [...map.querySelectorAll<HTMLElement>(".pmap-card, .pmap-roles__cell")];

    // Text overflowing the box that holds it — the defect that made every card
    // on the old map unreadable.
    let overflowing = 0;
    for (const card of cards) {
      for (const el of card.querySelectorAll<HTMLElement>("*")) {
        if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) {
          overflowing += 1;
          break;
        }
      }
    }

    // Anything drawn outside the region the map occupies.
    const mapBox = map.getBoundingClientRect();
    const clipped = cards.filter((card) => {
      const r = card.getBoundingClientRect();
      return r.bottom > mapBox.bottom + 1 || r.top < mapBox.top - 1 || r.right > mapBox.right + 1;
    }).length;

    // A fixed-height, overflow-hidden box is what clipped the old map. There
    // must not be one anywhere in here.
    const clippingContainers = [...map.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const style = getComputedStyle(el);
      return style.overflow === "hidden" || style.overflowY === "hidden";
    }).length;

    const text = (map as HTMLElement).innerText;

    return {
      cardCount: cards.length,
      overflowing,
      clipped,
      clippingContainers,
      // The old map had to tell the reader which way to read each row.
      directionWarnings: (text.match(/runs right to left|row \d+ of \d+/gi) ?? []).length,
      // …and left a stub beside a step pointing at nothing.
      stubs: map.querySelectorAll(".react-flow__node, [data-id^='stub-']").length,
      // Every step's number, so none is missing or repeated.
      numbers: [...map.querySelectorAll<HTMLElement>(".pmap-card__num")].map((n) => n.textContent?.trim()),
      text,
    };
  });
}

test.describe("the rebuilt printed map", () => {
  test.beforeAll(async () => {
    await makeTenderProcess();
  });

  test.afterAll(async () => {
    await removeTenderProcess();
    await setLayout(WORKSPACE, "FLOW");
  });

  for (const layout of ["FLOW", "ROLES"] as const) {
    test(`${layout}: every label is readable, nothing is clipped, nothing says which way to read`, async ({ page }) => {
      await setLayout(WORKSPACE, layout);
      await signIn(page);
      const map = await measureMap(page, TENDER_PROCESS_ID);

      expect(map.cardCount, "every step gets a card").toBe(18);
      expect(map.overflowing, "no card's text may overflow it — this was 18 of 18").toBe(0);
      expect(map.clipped, "nothing may be clipped by the map's own bounds — this was 1").toBe(0);
      expect(map.clippingContainers, "no fixed box may clip the map, which is what used to").toBe(0);
      expect(map.directionWarnings, "nothing tells the reader which way to read — this was 2 rows").toBe(0);
      expect(map.stubs, "no stub points into empty page — this was 1").toBe(0);
    });

    test(`${layout}: every step appears exactly once, in order`, async ({ page }) => {
      await setLayout(WORKSPACE, layout);
      await signIn(page);
      const map = await measureMap(page, TENDER_PROCESS_ID);

      expect(map.numbers).toEqual(Array.from({ length: 18 }, (_, i) => String(i + 1)));
    });

    test(`${layout}: the longest label prints whole`, async ({ page }) => {
      await setLayout(WORKSPACE, layout);
      await signIn(page);
      const map = await measureMap(page, TENDER_PROCESS_ID);

      // The label that overflowed its card on every previous version.
      expect(map.text).toContain("Internal resources evaluation and needs");
      expect(map.text).toContain("staffing, salaries, etc..)");
    });
  }

  test("FLOW: each branch carries its own label, and the converging paths are named", async ({ page }) => {
    await setLayout(WORKSPACE, "FLOW");
    await signIn(page);
    const map = await measureMap(page, TENDER_PROCESS_ID);

    // The fixture's two forks, each label against its own connection.
    expect(map.text).toContain("No");
    expect(map.text).toContain("Yes");
    expect(map.text).toContain("Locally");
    expect(map.text).toContain("Internationally");
    // Where the two contract paths converge, the map says what joins there
    // rather than leaving a marker to be matched up by eye.
    expect(map.text).toMatch(/joins step \d+ and step \d+/);
  });

  test("a process with more roles than the ceiling prints in Flow, and says why", async ({ page }) => {
    // The Roles layout is defined only to five columns; the design-and-build
    // process has six. It must fall back and explain, not print unreadably
    // narrow columns and not error.
    await makeWideProcess();
    await setLayout(WORKSPACE, "ROLES");
    await signIn(page);

    const map = await measureMap(page, WIDE_PROCESS_ID);
    expect(map.text).toContain("Printed in the Flow layout");
    expect(map.text).toMatch(/uses \d+ roles/);
    expect(map.overflowing).toBe(0);
    expect(map.clipped).toBe(0);

    await removeWideProcess();
  });

  test("exporting does not move a single stored step position", async ({ page }) => {
    const read = async () => {
      const client = new Client({ connectionString: process.env["DATABASE_URL"] });
      await client.connect();
      try {
        const { rows } = await client.query(
          `SELECT id, "positionX", "positionY", "order" FROM process_steps WHERE "processId" = $1 ORDER BY id`,
          [TENDER_PROCESS_ID]
        );
        return JSON.stringify(rows);
      } finally {
        await client.end();
      }
    };

    const before = await read();
    await setLayout(WORKSPACE, "FLOW");
    await signIn(page);
    await measureMap(page, TENDER_PROCESS_ID);
    expect(await read()).toBe(before);
  });

  test("a process with no steps renders the report's empty marker, not a broken map", async ({ page }) => {
    // The report decides a stepless process has no diagram to show and prints
    // its own "no data yet" marker, so the map component is never reached.
    // What matters is that the page renders at all — the component's own empty
    // state is covered directly in tests/unit/print-map-layout.test.ts.
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO processes (id, "workspaceId", code, name, "raciVisibleRoleIds", "inScope", "outOfScope",
                                "externalEntities", kpis, "createdAt", "updatedAt")
         VALUES ('empty-process-fixture', $1, 'EMP900', 'Empty process', '{}', '{}', '{}', '[]', '[]', now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [WORKSPACE]
      );
    } finally {
      await client.end();
    }

    await signIn(page);
    await page.goto(`/reports/${WORKSPACE}?ids=empty-process-fixture`);
    await page.waitForSelector(".report-paper");

    await expect(page.getByText("Empty process").first()).toBeVisible();
    await expect(page.getByText(/No data yet/).first()).toBeVisible();
    await expect(page.locator(".printed-map")).toHaveCount(0);

    const cleanup = new Client({ connectionString: process.env["DATABASE_URL"] });
    await cleanup.connect();
    try {
      await cleanup.query(`DELETE FROM processes WHERE id = 'empty-process-fixture'`);
    } finally {
      await cleanup.end();
    }
  });
});
