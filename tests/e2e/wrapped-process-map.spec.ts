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
import { makeWideProcess, removeWideProcess, WIDE_PROCESS_ID } from "../fixtures/wide-process";

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

/**
 * The process map's canvases. The org chart is the first React Flow on the
 * page; everything after it belongs to the map.
 *
 * A wrapped map is drawn one row-group per canvas rather than all of it in
 * one — a single canvas had to be capped at a page to keep a page break out of
 * a step card, and that capping scaled a four-row map to 0.42 with 3.7px
 * labels. These tests therefore read across the canvases, not into one.
 */
async function mapInfo(page: import("@playwright/test").Page, processIds: string[]) {
  await page.goto(`/reports/${WORKSPACE}?${processIds.map((id) => `ids=${id}`).join("&")}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const flows = [...document.querySelectorAll(".react-flow")];
    const mapFlows = flows.slice(1);
    if (mapFlows.length === 0) return null;
    const flow = mapFlows[0]!;
    const all = mapFlows.flatMap((f) => [...f.querySelectorAll<HTMLElement>(".react-flow__node")]);
    const id = (n: HTMLElement) => n.dataset["id"] ?? "";
    const lanes = all.filter((n) => id(n).startsWith("lane-"));
    const markers = all.filter((n) => id(n).startsWith("marker-"));
    // A wrapped map also carries its own furniture — the row label, the rule
    // that ends the row before it, and the short link to the next row. None
    // of it is a step.
    const FURNITURE = ["lane-", "marker-", "rowlabel-", "rowrule-", "stub-"];
    const steps = all.filter((n) => !FURNITURE.some((p) => id(n).startsWith(p)));
    // The smallest scale any group is drawn at — the map is only as readable
    // as its worst row.
    const scale = Math.min(
      ...mapFlows.map((f) => {
        const t = f.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? "";
        return Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? "1");
      })
    );
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
      rowLabelText: all
        .filter((n) => id(n).startsWith("rowlabel-"))
        .map((n) => ({ id: id(n), text: n.textContent ?? "", x: n.getBoundingClientRect().left })),
      stepBoxes: steps.map((n) => {
        const r = n.getBoundingClientRect();
        return { id: id(n), x: r.left, y: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }),
      // Lane bands carry their row in their id, so a step's row is the row of
      // the band its centre falls inside — a lane change within one row looks
      // exactly like a row change if you only compare y. Kept for a process
      // whose map still draws them (the interactive canvas, the PPTX deck);
      // empty on the report's wrapped map, which no longer draws lane bands
      // at all — rowLabelBoxes below is the row-detector that works either way.
      laneBoxes: lanes.map((n) => {
        const r = n.getBoundingClientRect();
        return { row: Number(id(n).split("-")[1]), top: r.top, bottom: r.bottom };
      }),
      // Every row draws exactly one label, regardless of whether it also
      // draws lane bands, so a step's row is the row of the nearest label at
      // or above its own centre — the row-detector these tests use once lane
      // bands can no longer be relied on to exist.
      rowLabelBoxes: all
        .filter((n) => id(n).startsWith("rowlabel-"))
        .map((n) => ({ row: Number(id(n).split("-")[1]), top: n.getBoundingClientRect().top })),
      edgeCount: flow.querySelectorAll(".react-flow__edge").length,
      // The seam is drawn inside a canvas when both rows share one, and
      // between the canvases when they do not — a wrapped map is one box per
      // row-group, and a line cannot cross from one box to the next.
      sealEdges:
        mapFlows.flatMap((f) => [...f.querySelectorAll<SVGPathElement>(".react-flow__edge-path")])
          .filter((p) =>
            (p.getAttribute("style") ?? "").includes("13, 148, 136") ||
            (p.style.stroke ?? "").toLowerCase() === "#0d9488"
          ).length + document.querySelectorAll(".border-teal-600").length,
      canvases: mapFlows.length,
      outside: mapFlows.flatMap((f) => {
        const fr = f.getBoundingClientRect();
        return [...f.querySelectorAll<HTMLElement>(".react-flow__node")].filter((n) => {
          const r = n.getBoundingClientRect();
          return r.right > fr.right + 2 || r.left < fr.left - 2;
        });
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

  // More than one row. The report no longer draws lane bands at all, so the
  // row count comes from the row labels — always exactly one per row — rather
  // than from lane ids, which used to double as a row-detector.
  expect(map.rowLabels.length).toBeGreaterThan(1);

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

  // A short link at each end of every connection the wrap had to break — and
  // since the rows run serpentine, the seam between one row and the next is no
  // longer one of them: those two steps share a column, so the line is simply
  // drawn. What is left is the fixture's extra labelled branch, which skips
  // ahead into a row it is not adjacent to and still cannot be drawn.
  expect(map.stubs).toBe(map.markerText.length);
  expect(map.stubs % 2).toBe(0);
  expect(map.stubs, "only the un-drawable crossing is marked").toBe(2);
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

test("every step still says which role it belongs to, without a lane to say it instead", async ({ page }) => {
  // Superseded by dropping lane bands from the report (this feature): a row
  // no longer reserves a band per role, so the thing this test used to check
  // — "a row only gets the lanes it needs" — no longer applies, there being
  // no lanes at all. What must still be true is the reason that trade was
  // judged safe: every step's role stays legible on its own card.
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  expect(map.laneIds).toEqual([]);
  expect(map.stepCount).toBeGreaterThan(1);

  // At least three distinct roles are readable straight off the cards — this
  // fixture's whole point (three roles plus a roleless step) is preserved by
  // reading it off the card rather than off a lane it no longer has.
  const ROLE_NAMES = ["AP Clerk", "Finance Manager", "Procurement Lead"];
  for (const role of ROLE_NAMES) {
    expect(
      map.stepLabels.some((t) => t.toUpperCase().includes(role.toUpperCase())),
      `no card carries the role "${role}"`
    ).toBe(true);
  }
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


test("rows run serpentine, so each begins under where the last ended", async ({ page }) => {
  // The request, in the user's words: "make the starting point on a new row
  // start directly below the ending point, so it joins seamlessly even if the
  // rest will be backward."
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  // Every row draws exactly one label, above its own steps, whether or not it
  // also draws lane bands — so a step's row is whichever row label sits
  // nearest above it. This used to read lane bands instead; the report no
  // longer draws any.
  const rowOf = (cy: number) => {
    const above = map.rowLabelBoxes.filter((b) => b.top <= cy + 40);
    if (above.length === 0) return -1;
    return above.reduce((best, b) => (b.top > best.top ? b : best)).row;
  };

  // Steps in the order the process runs, which is the order they were seeded.
  const ordered = map.stepBoxes
    .slice()
    .sort((a, b) => Number(a.id.split("-step-")[1]) - Number(b.id.split("-step-")[1]));

  // Wherever two consecutive steps sit on different rows, the second must be
  // directly beneath the first — that is the whole point.
  let seams = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const here = ordered[i]!;
    const next = ordered[i + 1]!;
    const a = rowOf(here.cy);
    const b = rowOf(next.cy);
    if (a === -1 || b === -1 || a === b) continue;
    if (b !== a + 1) continue; // a branch skipping rows, not a seam
    seams += 1;
    expect(
      Math.abs(next.cx - here.cx),
      `${next.id} should begin directly below ${here.id}`
    ).toBeLessThan(30);
  }
  expect(seams, "a 22-step process wraps, so it has seams").toBeGreaterThanOrEqual(3);
});

test("a backward row says so, at the end it starts from", async ({ page }) => {
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  const labels = map.rowLabelText.slice().sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]));
  expect(labels.length).toBeGreaterThan(2);

  // Rows alternate, and only the backward ones carry the warning.
  expect(labels[0]!.text).not.toMatch(/right to left/i);
  expect(labels[1]!.text, "row 2 runs backward and says so").toMatch(/right to left/i);
  expect(labels[2]!.text).not.toMatch(/right to left/i);

  // ...and the warning sits at the end the row starts from, not at the left
  // where a reader meets it only after crossing the row.
  expect(labels[1]!.x, "a backward row's label sits to the right").toBeGreaterThan(labels[0]!.x);
});

test("the seam between rows is drawn, not left to a pair of pills", async ({ page }) => {
  await signIn(page);
  const map = (await mapInfo(page, [LONG_PROCESS_ID]))!;

  // Teal, like the row label and the rule: the furniture that says where one
  // row ends and the next begins.
  expect(map.sealEdges, "one drawn drop per row boundary").toBeGreaterThanOrEqual(map.rowLabels.length - 1);

  // And the markers that used to stand in for them are gone from the seams.
  const continues = map.markerText.filter((t) => /continues on row/.test(t));
  expect(continues.length, "only the un-drawable crossing still needs a marker").toBe(1);
});

test("every row's rule is drawn in that row's own box, not a neighbour's", async ({ page }) => {
  // The six-role process, not the three-role one: rows that use different
  // numbers of lanes are different heights, which is what makes one row's
  // vertical range reach into the next.
  //
  // A box may legitimately hold more than one wrap-row now that bands are
  // dropped from the report: a bandless row is short enough that several fit
  // the same page-height budget, which is the whole point of this feature.
  // What still must never happen is a row's *rule* — the line marking where
  // it begins — turning up in a different box from the row it belongs to,
  // which was the original bug this test guards (a row's range reaching 14px
  // into the next row's, so the rule was drawn at the foot of the box above).
  const wide = await makeWideProcess();
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${wide.id}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);

  const boxes = await page.evaluate(() => {
    const id = (n: Element) => n.getAttribute("data-id") ?? "";
    return [...document.querySelectorAll(".react-flow")]
      .map((flow) => {
        const nodes = [...flow.querySelectorAll(".react-flow__node")];
        const label = nodes.find((n) => id(n).startsWith("rowlabel-"));
        if (!label) return null;
        const rows = new Set(
          nodes
            .map((n) => /^(?:lane|rowlabel|rowrule)-(\d+)/.exec(id(n))?.[1])
            .filter((r): r is string => r !== undefined)
            .map(Number)
        );
        return {
          rows: [...rows].sort((a, b) => a - b),
          rules: nodes.filter((n) => id(n).startsWith("rowrule-")).map(id),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  });

  expect(boxes.length).toBeGreaterThan(0);

  // Every row appears in exactly one box, and a box's rows are contiguous —
  // no box skips a row or holds two non-adjacent ones, which would mean
  // furniture leaked across a group boundary.
  const allRows = boxes.flatMap((b) => b.rows);
  expect(allRows, "every row exactly once, across all boxes").toEqual(
    [...allRows].sort((a, b) => a - b)
  );
  expect(new Set(allRows).size).toBe(allRows.length);
  for (const box of boxes) {
    for (let i = 1; i < box.rows.length; i++) {
      expect(box.rows[i], `box holding rows ${box.rows.join(", ")} is not contiguous`).toBe(
        box.rows[i - 1]! + 1
      );
    }
  }

  // The rule for row N lives in the box that holds row N — never the box
  // before it, and never absent because it drifted into the wrong box.
  for (const box of boxes) {
    const expectedRules = box.rows.filter((r) => r > 0).map((r) => `rowrule-${r}`);
    expect(box.rules).toEqual(expectedRules);
  }

  // Row 0 never has a rule — there is no row above it to be ruled off from.
  const firstBox = boxes.find((b) => b.rows.includes(0))!;
  expect(firstBox.rules.includes("rowrule-0")).toBe(false);

  await removeWideProcess();
});


test("the report drops lane bands — a row is one card tall, whatever roles it touches", async ({ page }) => {
  // The defect this feature exists for: a row of six steps across five roles
  // was drawn five lane bands tall, most of it blank. The fix is that the
  // report draws no lane bands at all — a row is a single band sized to its
  // tallest card — while the live canvas (a separate, unwrapped rendering
  // path this feature never touches) keeps its full swimlanes.
  await makeWideProcess();
  await signIn(page);
  await page.goto(`/reports/workspace-acme?ids=${WIDE_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);

  const found = await page.evaluate(() => {
    const id = (n: Element) => n.getAttribute("data-id") ?? "";
    const flows = [...document.querySelectorAll(".react-flow")];
    const mapFlows = flows.slice(1);
    const nodes = mapFlows.flatMap((f) => [...f.querySelectorAll(".react-flow__node")]);
    const laneNodes = nodes.filter((n) => id(n).startsWith("lane-"));
    const cards = nodes.filter((n) => !["lane-", "marker-", "rowlabel-", "rowrule-", "stub-"].some((p) => id(n).startsWith(p)));
    // A role name, on the card, exactly where it already was — this feature
    // does not add it, it relies on it already being there.
    const roleTexts = cards.map((n) => n.textContent ?? "");
    return {
      laneNodeCount: laneNodes.length,
      cardCount: cards.length,
      hasProcurementOnACard: roleTexts.some((t) => /PROCUREMENT/i.test(t)),
      hasDesignHouseOnACard: roleTexts.some((t) => /DESIGN HOUSE/i.test(t)),
    };
  });

  expect(found.laneNodeCount, "no lane bands should be drawn on the report's wrapped map").toBe(0);
  expect(found.cardCount).toBeGreaterThan(0);
  expect(found.hasProcurementOnACard, "a step's role must still be legible on its own card").toBe(true);
  expect(found.hasDesignHouseOnACard).toBe(true);

  await removeWideProcess();
});

test("the report's rows fit far fewer pages without lane bands", async ({ page }) => {
  await makeWideProcess();
  await signIn(page);
  await page.goto(`/reports/workspace-acme?ids=${WIDE_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForTimeout(3000);

  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
  });
  const text = pdf.toString("latin1");
  const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  // Measured before this feature, on this same fixture (research.md): the map
  // spanned 4 pages of a 9-page report (rows 1-4 one to a page, row 5 sharing
  // a page with the next section). One lane band per role, drawn on every row
  // regardless of how many of that row's own steps used it, is what cost the
  // pages — dropping bands is what gets them back.
  expect(pageCount, "the whole report must be measurably shorter without lane bands").toBeLessThan(9);

  await removeWideProcess();
});
