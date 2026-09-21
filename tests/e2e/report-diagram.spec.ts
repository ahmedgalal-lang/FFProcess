import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { expectDiamond } from "./shapes";

const PROCESS_ID = "report-wide-diagram-1";
const STEP_COUNT = 17;
let roleName = "";

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
    roleName = role.rows[0].name;

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

test("Export Report's static diagram fits a wide process instead of clipping it", async ({ page }) => {
  await signIn(page);

  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /WIDE100/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  // A wrapped map is drawn one row-group per box, so "the diagram" is all of
  // them — the cards this checks for are spread across the rows.
  // A wrapped map is drawn one row-group per box, so "the diagram" is several
  // boxes. Each step has to be inside the box it belongs to, which is what the
  // single-container version of this check was really asserting.
  const diagram = page.locator(".print-keep.relative").filter({ has: page.locator(".react-flow") });
  await expect(diagram.first()).toBeVisible();

  const stepNodes = diagram.locator(".react-flow__node").filter({ hasText: /Step \d+/ });
  await expect(stepNodes).toHaveCount(STEP_COUNT);

  // Nothing clipped by the box it is drawn in — the failure mode was a node
  // positioned beyond what the canvas could show, invisible behind the
  // container's overflow-hidden edge.
  const clipped = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".print-keep.relative")].filter((b) =>
      b.querySelector(".react-flow")
    );
    let bad = 0;
    for (const box of boxes) {
      const br = box.getBoundingClientRect();
      for (const n of box.querySelectorAll<HTMLElement>(".react-flow__node")) {
        const r = n.getBoundingClientRect();
        if (r.left < br.left - 1 || r.right > br.right + 1 || r.top < br.top - 1 || r.bottom > br.bottom + 1) {
          bad += 1;
        }
      }
    }
    return bad;
  });
  expect(clipped, "nodes clipped by their own box").toBe(0);

  // The other half of what "swimlane not visible" reported: the steps must not
  // be floating with no idea whose they are. A *wrapped* printed map no longer
  // draws lane bands at all — a row of steps across several roles was drawn
  // one band per role and cost the map pages of blank paper — so the role is
  // read off the card, which is where it has always also been printed. An
  // unwrapped map still draws its lanes, untouched.
  const laneBands = diagram.locator('.react-flow__node[data-id^="lane-"]');
  expect(await laneBands.count(), "a wrapped printed map draws no lane bands").toBe(0);

  const withRole = stepNodes.filter({ hasText: roleName });
  expect(
    await withRole.count(),
    `no card carries the role "${roleName}"`
  ).toBeGreaterThan(0);
});

test("Export Report's static diagram draws an Unassigned lane for steps with no owner", async ({ page }) => {
  await signIn(page);

  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /NOLANE1/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  // A wrapped map is drawn one row-group per box, so "the diagram" is all of
  // them — the cards this checks for are spread across the rows.
  const diagram = page
    .locator("main .rounded-xl.border.border-slate-200.bg-white")
    .filter({ has: page.locator(".react-flow") });
  await expect(diagram.first()).toBeVisible();

  // The failure mode: zero lane nodes at all, because the old code only ever
  // built a lane for a step that had a role. It has to be exactly the
  // "lane-unassigned" id — the interactive Process Map's own name for it —
  // proving this draws through the same assignSwimlanes answer.
  // "lane-unassigned" unwrapped, "lane-<row>-unassigned" once a map wraps —
  // either way the lane exists and is named the same thing the interactive
  // Process Map names it.
  const lane = diagram.locator(
    '.react-flow__node[data-id="lane-unassigned"], .react-flow__node[data-id$="-unassigned"]'
  );
  await expect(lane.first()).toBeVisible();
  await expect(lane.first()).toContainText("Unassigned");

  const stepNodes = diagram.locator(".react-flow__node").filter({ hasText: /Start|Do the thing|Finish/ });
  await expect(stepNodes).toHaveCount(3);
});

test("Export Report's static diagram shows the same documented-card content as the live canvas", async ({ page }) => {
  await signIn(page);

  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByRole("checkbox", { name: /PUR101/ }).check();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");

  // A wrapped map is drawn one row-group per box, so "the diagram" is all of
  // them — the cards this checks for are spread across the rows.
  const diagram = page
    .locator("main .rounded-xl.border.border-slate-200.bg-white")
    .filter({ has: page.locator(".react-flow") });
  await expect(diagram.first()).toBeVisible();

  const createPO = diagram.locator(".react-flow__node").filter({ hasText: "Create Purchase Order" });
  await expect(createPO.getByText("SLA 2d")).toBeVisible();

  const sendPO = diagram.locator(".react-flow__node").filter({ hasText: "Send PO to Vendor" });
  await expect(sendPO.getByText("→ PUR102")).toBeVisible();

  const receiveGoods = diagram.locator(".react-flow__node").filter({ hasText: "Receive Goods" });
  await expect(receiveGoods.getByText("no SLA set")).toBeVisible();

  const decision = diagram.locator(".react-flow__node").filter({ hasText: "Approve PO?" });
  await expect(decision.getByText(/At or above \$100,000/)).toBeVisible();

  // The printed diagram draws the same notation as the live canvas — a
  // decision is a diamond on paper too, not just on screen.
  await expectDiamond(decision);
  await expect(createPO.locator("svg polygon")).toHaveCount(0);
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

test("Export Report's process map fills the page width rather than leaving a band of it empty", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/reports/workspace-acme?ids=" + RAILS_MAIN_ID);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".react-flow__node");

  const used = await page.evaluate(() => {
    // Every canvas the map is drawn across, not just the last one: a wrapped
    // map is one box per row-group, and the widest row is what has to fit.
    const maps = [...document.querySelectorAll(".react-flow")].slice(1) as HTMLElement[];
    if (maps.length === 0) return null;
    const widths = maps.map((flow) => {
      const rects = [...flow.querySelectorAll(".react-flow__node")].map((n) =>
        n.getBoundingClientRect()
      );
      if (rects.length === 0) return 0;
      const drawn = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
      return (100 * drawn) / flow.getBoundingClientRect().width;
    });
    return Math.max(...widths);
  });

  // Was 89.4%: fitView divides the box by (1 + padding), so the old 0.12 was
  // an eleven-percent strip of page the drawing was never allowed to use.
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
