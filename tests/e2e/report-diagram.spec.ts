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

  const diagram = page
    .locator("main .rounded-xl.border.border-slate-200.bg-white")
    .filter({ has: page.locator(".react-flow") })
    .last();
  await expect(diagram).toBeVisible();
  const containerBox = (await diagram.boundingBox())!;

  // Every step rendered, and none of them clipped outside the diagram's own
  // box — the failure mode was a node positioned beyond what fitView could
  // shrink to, invisible behind the container's overflow-hidden edge.
  const stepNodes = diagram.locator(".react-flow__node").filter({ hasText: /Step \d+/ });
  await expect(stepNodes).toHaveCount(STEP_COUNT);

  const boxes = await stepNodes.evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect()));
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(containerBox.x - 1);
    expect(box.top).toBeGreaterThanOrEqual(containerBox.y - 1);
    expect(box.right).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
    expect(box.bottom).toBeLessThanOrEqual(containerBox.y + containerBox.height + 1);
  }

  // The swimlane itself rendered — not just the steps floating with no lane
  // context, the other half of what "swimlane not visible" reported. Lane
  // nodes carry a stable "lane-<roleId>" id, unlike a step node's uuid, so
  // that's what picks the lane out from every step node that also shows the
  // role name as its own subtitle.
  const lane = diagram.locator('.react-flow__node[data-id^="lane-"]').filter({ hasText: roleName });
  await expect(lane).toHaveCount(1);
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

  const diagram = page
    .locator("main .rounded-xl.border.border-slate-200.bg-white")
    .filter({ has: page.locator(".react-flow") })
    .last();
  await expect(diagram).toBeVisible();

  // The failure mode: zero lane nodes at all, because the old code only ever
  // built a lane for a step that had a role. It has to be exactly the
  // "lane-unassigned" id — the interactive Process Map's own name for it —
  // proving this draws through the same assignSwimlanes answer.
  const lane = diagram.locator('.react-flow__node[data-id="lane-unassigned"]');
  await expect(lane).toHaveCount(1);
  await expect(lane).toContainText("Unassigned");

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

  const diagram = page
    .locator("main .rounded-xl.border.border-slate-200.bg-white")
    .filter({ has: page.locator(".react-flow") })
    .last();
  await expect(diagram).toBeVisible();

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
