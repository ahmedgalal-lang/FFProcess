import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";

const PROCESS_ID = "report-wide-diagram-1";
const STEP_COUNT = 17;
let roleName = "";

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

test("Export Report's static diagram fits a wide process instead of clipping it", async ({ page }) => {
  await page.goto("/login");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/workspaces");

  await page.goto("/workspaces/workspace-acme/export");
  const checkboxes = page.locator('input[type="checkbox"][name="ids"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).uncheck();
  await page.getByLabel(/WIDE100/).check();
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
