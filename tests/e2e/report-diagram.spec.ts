import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

const PROCESS_ID = "report-wide-diagram-1";
const STEP_COUNT = 17;

const UNASSIGNED_PROCESS_ID = "report-unassigned-lane-1";

/**
 * A wide, single-lane process — the shape that exposed the bug: the report's
 * static diagram is locked to a fixed height with panning and zooming turned
 * off, so unlike the interactive Process Map, there is no way for a reader to
 * scroll to whatever the initial fit didn't show. If the fit can't shrink far
 * enough, the diagram silently clips instead.
 */
test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM processes WHERE id = $1`, [PROCESS_ID]);
    await client.query(
      `INSERT INTO processes (id, "workspaceId", code, name, "createdAt", "updatedAt")
       VALUES ($1, 'workspace-acme', 'WIDE100', 'Wide Single-Lane Process', now(), now())`,
      [PROCESS_ID]
    );
    const role = await client.query(`SELECT id, name FROM roles WHERE "workspaceId" = 'workspace-acme' ORDER BY name LIMIT 1`);
    const roleId = role.rows[0].id;

    for (let i = 0; i < STEP_COUNT; i++) {
      const type = i === 0 ? "START" : i === STEP_COUNT - 1 ? "END" : "TASK";
      await client.query(
        `INSERT INTO process_steps
           (id, "processId", type, label, "assignedRoleId", "swimlaneRoleId", "positionX", "positionY", "order", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $5, $6, 105, $7, now())`,
        [`${PROCESS_ID}-s${i}`, PROCESS_ID, type, `Step ${i + 1}`, roleId, 190 + i * 170, i]
      );
    }
    for (let i = 0; i < STEP_COUNT - 1; i++) {
      await client.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId")
         VALUES ($1, $2, $3, $4)`,
        [`${PROCESS_ID}-c${i}`, PROCESS_ID, `${PROCESS_ID}-s${i}`, `${PROCESS_ID}-s${i + 1}`]
      );
    }
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    // Steps and connections cascade from the process itself.
    await client.query(`DELETE FROM processes WHERE id = $1`, [PROCESS_ID]);
  } finally {
    await client.end();
  }
});

/**
 * A process built with no step owners at all — the shape a value-chain
 * activity has before anyone assigns a department, and the one the earlier
 * static diagram lost entirely: its own laneOrder only ever added a lane for
 * a step that had a role, so an all-roleless process got zero lane nodes and
 * every step fell back to its stale stored positionY, rendering the whole
 * diagram as one flat line with no swimlane band at all.
 */
test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM processes WHERE id = $1`, [UNASSIGNED_PROCESS_ID]);
    await client.query(
      `INSERT INTO processes (id, "workspaceId", code, name, "createdAt", "updatedAt")
       VALUES ($1, 'workspace-acme', 'NOLANE1', 'Unassigned Steps Process', now(), now())`,
      [UNASSIGNED_PROCESS_ID]
    );
    const labels = ["Start", "Do the thing", "Finish"];
    for (let i = 0; i < labels.length; i++) {
      const type = i === 0 ? "START" : i === labels.length - 1 ? "END" : "TASK";
      await client.query(
        `INSERT INTO process_steps (id, "processId", type, label, "positionX", "positionY", "order", "createdAt")
         VALUES ($1, $2, $3, $4, $5, 105, $6, now())`,
        [`${UNASSIGNED_PROCESS_ID}-s${i}`, UNASSIGNED_PROCESS_ID, type, labels[i], 190 + i * 170, i]
      );
    }
    for (let i = 0; i < labels.length - 1; i++) {
      await client.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId")
         VALUES ($1, $2, $3, $4)`,
        [`${UNASSIGNED_PROCESS_ID}-c${i}`, UNASSIGNED_PROCESS_ID, `${UNASSIGNED_PROCESS_ID}-s${i}`, `${UNASSIGNED_PROCESS_ID}-s${i + 1}`]
      );
    }
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM processes WHERE id = $1`, [UNASSIGNED_PROCESS_ID]);
  } finally {
    await client.end();
  }
});

test("Export Report's map shows a wide process whole, clipping nothing", async ({ page }) => {
  // Reported as "swimlane not visible": the old canvas drew the map into a
  // fixed box and scaled it to fit, so a wide process lost both its edges and
  // its legibility. The rebuilt map has no box to be clipped by — it is
  // ordinary flowing HTML — so the check is simply that every card is whole
  // and inside the map.
  await signIn(page);
  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /WIDE100/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".printed-map");

  const found = await page.evaluate(() => {
    const map = document.querySelector(".printed-map")!;
    const box = map.getBoundingClientRect();
    const cards = [...map.querySelectorAll<HTMLElement>(".pmap-card, .pmap-roles__cell")];
    return {
      cards: cards.length,
      clipped: cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1;
      }).length,
      overflowing: cards.filter((c) =>
        [...c.querySelectorAll<HTMLElement>("*")].some(
          (el) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1
        )
      ).length,
      // The role is read off the card now — there are no lane bands to read it
      // from, and no canvas to draw them on.
      canvases: map.querySelectorAll(".react-flow").length,
      text: (map as HTMLElement).innerText,
    };
  });

  expect(found.cards).toBeGreaterThan(0);
  expect(found.clipped, "nothing may be clipped by the map's bounds").toBe(0);
  expect(found.overflowing, "no card's text may overflow it").toBe(0);
  expect(found.canvases, "the printed map draws no canvas").toBe(0);
});

test("Export Report's map keeps a step that has no owner, and says so on the card", async ({ page }) => {
  // The defect behind this: the old code only ever built a lane for a step
  // that *had* a role, so a process of roleless steps lost its lane entirely
  // and the steps collapsed onto one line. The rebuilt map has no lanes — the
  // role lives on the card — so what must hold is that the step still appears
  // and still states that nobody owns it.
  await signIn(page);
  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /NOLANE1/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".printed-map");

  const map = page.locator(".printed-map");
  await expect(map).toBeVisible();
  await expect(map.getByText("No role set").first()).toBeVisible();

  for (const label of ["Start", "Do the thing", "Finish"]) {
    await expect(map.getByText(label, { exact: false }).first()).toBeVisible();
  }
});

test("Export Report's map carries the same documented content the card always has", async ({ page }) => {
  // The rebuild replaced how the map is drawn, not what a card says. An SLA, an
  // approval gate, a cross-process link and the fact that a step is a decision
  // all still have to reach the page — this is the check that the new renderer
  // did not quietly drop any of them.
  await signIn(page);
  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /PUR101/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await page.waitForSelector(".printed-map");

  const text = await page.locator(".printed-map").innerText();

  expect(text).toContain("Create Purchase Order");
  expect(text).toContain("SLA 2d");
  expect(text).toContain("Send PO to Vendor");
  expect(text).toContain("→ PUR102");
  expect(text).toContain("Receive Goods");
  expect(text).toContain("no SLA set");
  expect(text).toContain("Approve PO?");
  // Worded by gateLine, the one place this sentence is written, so the map,
  // the Authority Matrix, the deck and the spreadsheet cannot drift apart.
  expect(text).toMatch(/At or above \$100,000/);
  // A decision is still marked as one, on paper as on screen. Case-insensitive:
  // the chip is uppercased in CSS, and innerText reflects that.
  expect(text).toMatch(/decision/i);
});

/**
 * A wide chain of rails for the report's Helicopter View: one long process
 * with two others branching off it, which is what pushes buildMilestoneRails'
 * fixed-pixel layout past the width of an A4 page.
 */
const RAILS_MAIN_ID = "report-rails-main-1";
const RAILS_BRANCH_ID = "report-rails-branch-1";
const RAILS_MAIN_STEPS = 18;

test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    for (const id of [RAILS_BRANCH_ID, RAILS_MAIN_ID]) {
      await client.query(`DELETE FROM processes WHERE id = $1`, [id]);
    }
    const role = await client.query(
      `SELECT id FROM roles WHERE "workspaceId" = 'workspace-acme' ORDER BY name LIMIT 1`
    );
    const roleId = role.rows[0].id;

    await client.query(
      `INSERT INTO processes (id, "workspaceId", code, name, "createdAt", "updatedAt")
       VALUES ($1, 'workspace-acme', 'RAIL100', 'Wide Rail Chain', now(), now())`,
      [RAILS_MAIN_ID]
    );
    for (let i = 0; i < RAILS_MAIN_STEPS; i++) {
      await client.query(
        `INSERT INTO process_steps
           (id, "processId", type, label, "assignedRoleId", "swimlaneRoleId", "positionX", "positionY", "order", "createdAt", milestone)
         VALUES ($1, $2, 'TASK', $3, $4, $4, $5, 105, $6, now(), true)`,
        [`${RAILS_MAIN_ID}-s${i}`, RAILS_MAIN_ID, `Rail step ${i + 1}`, roleId, 210 + i * 262, i]
      );
    }

    // Branching off the last step pushes the second rail out to the far right,
    // which is what makes the drawing wider than the page.
    await client.query(
      `INSERT INTO processes (id, "workspaceId", code, name, "createdAt", "updatedAt", "branchFromStepId")
       VALUES ($1, 'workspace-acme', 'RAIL101', 'Rail Branch', now(), now(), $2)`,
      [RAILS_BRANCH_ID, `${RAILS_MAIN_ID}-s${RAILS_MAIN_STEPS - 1}`]
    );
    for (let i = 0; i < 4; i++) {
      await client.query(
        `INSERT INTO process_steps
           (id, "processId", type, label, "assignedRoleId", "swimlaneRoleId", "positionX", "positionY", "order", "createdAt", milestone)
         VALUES ($1, $2, 'TASK', $3, $4, $4, $5, 105, $6, now(), true)`,
        [`${RAILS_BRANCH_ID}-s${i}`, RAILS_BRANCH_ID, `Branch step ${i + 1}`, roleId, 210 + i * 262, i]
      );
    }
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    for (const id of [RAILS_BRANCH_ID, RAILS_MAIN_ID]) {
      await client.query(`DELETE FROM processes WHERE id = $1`, [id]);
    }
  } finally {
    await client.end();
  }
});

test("Export Report's Helicopter View scales a wide chain to fit instead of scrolling it", async ({ page }) => {
  await signIn(page);

  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /RAIL100/ }).check();
  await page.getByRole("checkbox", { name: /RAIL101/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  const railsSection = page.locator("main > section").filter({ hasText: "Helicopter View" });
  const railsBox = railsSection.locator(".break-inside-avoid").first();
  await expect(railsBox).toBeVisible();

  // The failure mode: the rails were drawn at their own fixed pixel width
  // inside an overflow-x-auto box, so on paper everything past the page edge
  // was simply gone — and the scrollbar that would have reached it is dead
  // furniture in a PDF. Nothing may extend past the box it's drawn in.
  const fit = await railsBox.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);

  // Both rails are actually rendered, including the branch pushed furthest
  // right — the part a clipped drawing lost first.
  await expect(railsBox.getByText("Wide Rail Chain")).toBeVisible();
  await expect(railsBox.getByText("Rail Branch")).toBeVisible();
  await expect(railsBox.getByText(`Rail step ${RAILS_MAIN_STEPS}`)).toBeVisible();
  await expect(railsBox.getByText("Branch step 4")).toBeVisible();
});

/**
 * The page width is the whole budget a printed diagram has, and both drawings
 * on the report page were spending only part of it.
 *
 * The Helicopter View was the worse of the two: its scale was clamped with
 * `Math.min(1, …)`, so it shrank a chain too wide for the page but never grew
 * one that was too narrow. buildMilestoneRails floors its width at RAIL_WIDTH,
 * which is comfortably inside an A4 landscape page, so the *common* case — an
 * engagement of one or two processes — always landed at exactly scale 1 and
 * was drawn across three-quarters of the sheet with the rest left blank. It
 * was reported simply as "very small".
 *
 * Both assertions are on the fraction of the page actually used, because that
 * is the complaint. Asserting a scale or a pixel width would pass just as
 * happily with the drawing marooned in the middle of an empty page.
 */
test("Export Report's Helicopter View fills the page width rather than sitting small on it", async ({
  page,
}) => {
  await signIn(page);

  // One narrow chain on purpose. A wide one is scaled *down* to fit and so
  // fills the page either way — it cannot tell whether the clamp is there.
  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /RAIL101/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  const railsSection = page.locator("main > section").filter({ hasText: "Helicopter View" });
  await expect(railsSection.locator(".break-inside-avoid").first()).toBeVisible();

  const used = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find((h) =>
      /Helicopter View/i.test(h.textContent ?? "")
    );
    const section = heading!.closest("section")!;
    const scaled = section.querySelector<HTMLElement>("div[style*='scale(']");
    if (!scaled) return null;
    const paper = document.querySelector(".report-paper") as HTMLElement;
    const style = getComputedStyle(paper);
    const contentWidth =
      paper.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const drawn = (scaled.parentElement as HTMLElement).getBoundingClientRect().width;
    return (100 * drawn) / contentWidth;
  });

  // Was 75.5% — drawn at scale 1 in a page a third wider than it.
  expect(used).not.toBeNull();
  expect(used!).toBeGreaterThan(95);
  expect(used!).toBeLessThanOrEqual(100.5);
});

test("Export Report's map uses the full page width it is given", async ({ page }) => {
  // Was 89.4%: the old canvas scaled its drawing to fit, and fitView divided
  // the box by (1 + padding), so a strip of every page was width the map was
  // never allowed to use. Flowing HTML takes the width it is given, which is
  // what this now measures.
  await signIn(page);
  await page.goto("/reports/workspace-acme?ids=" + RAILS_MAIN_ID);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");

  const used = await page.evaluate(() => {
    const map = document.querySelector<HTMLElement>(".printed-map")!;
    const rows = [...map.querySelectorAll<HTMLElement>(".pmap-flow__row, .pmap-roles__row")];
    if (rows.length === 0) return null;
    const widest = Math.max(...rows.map((r) => r.getBoundingClientRect().width));
    return (100 * widest) / map.getBoundingClientRect().width;
  });

  expect(used).not.toBeNull();
  expect(used!).toBeGreaterThan(95);
});

/**
 * A rail with more milestones than fit the page used to be dealt with by
 * shrinking the whole drawing until it did. At 18 beads that reached about
 * 0.43, which put the label text near 4px — fine on a screen you can zoom, and
 * useless on the printed page this view exists to produce. It was reported
 * simply as too small to read.
 *
 * It now folds onto more than one line and the beads stay full size. The two
 * assertions that matter are that nothing was scaled down and that nothing
 * ended up outside the page, because a wrap that overflows is no better than
 * a shrink.
 */
test("Export Report's Helicopter View wraps a long rail instead of shrinking it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /RAIL100/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  const railsSection = page.locator("main > section").filter({ hasText: "Helicopter View" });
  await expect(railsSection.locator(".break-inside-avoid").first()).toBeVisible();

  const info = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find((h) =>
      /Helicopter View/i.test(h.textContent ?? "")
    );
    const section = heading!.closest("section")!;
    const scaled = section.querySelector<HTMLElement>("div[style*='scale(']")!;
    const frame = scaled.parentElement!.parentElement as HTMLElement;
    const box = frame.getBoundingClientRect();

    // A bead is the label block; its text is what has to stay readable.
    const labels = [...section.querySelectorAll<HTMLElement>("div.line-clamp-2")];
    const rects = labels.map((l) => l.getBoundingClientRect());
    const fontSize = labels[0] ? parseFloat(getComputedStyle(labels[0]).fontSize) : 0;

    return {
      scale: Number(/scale\(([\d.]+)\)/.exec(scaled.style.transform)?.[1] ?? "1"),
      beadCount: labels.length,
      // Distinct vertical bands the beads sit in — more than one means it wrapped.
      rows: new Set(rects.map((r) => Math.round(r.top / 20))).size,
      renderedFontPx: fontSize,
      overflowing: rects.filter((r) => r.left < box.left - 1 || r.right > box.right + 1).length,
    };
  });

  // It wrapped rather than shrank.
  expect(info.beadCount).toBeGreaterThan(9);
  expect(info.rows, "a long rail folds onto more than one line").toBeGreaterThan(1);
  expect(info.scale, "the drawing is not shrunk to fit").toBeGreaterThan(0.9);

  // And the text is actually readable on paper.
  expect(info.renderedFontPx * info.scale).toBeGreaterThanOrEqual(8);

  // Nothing was pushed off the page by the wrap.
  expect(info.overflowing, "bead labels outside the page").toBe(0);
});
