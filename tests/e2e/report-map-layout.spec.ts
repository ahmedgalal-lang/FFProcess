import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { test, expect } from "@playwright/test";
import { signIn, E2E_EDITOR } from "./sign-in";
import { makeTenderProcess, removeTenderProcess, TENDER_PROCESS_ID } from "../fixtures/tender-process";

/**
 * SC-010: a consultant can change a client's map layout and see the map
 * redraw without leaving the report, and the choice survives a reload and a
 * new session.
 *
 * Everything else in this suite measures a single layout's output. This is
 * the one test of the control that picks between them — the "Map layout"
 * toggle beside the density control in the export preview — which nothing
 * else in the printed-map specs exercises: they set the layout directly in
 * the database to get straight to the rendering, the same shortcut used here
 * for setup but never for the click itself.
 */
const WORKSPACE = "workspace-acme";
const VIEWER = { email: "viewer.maplayout.e2e@example.com", password: "password123" };
let viewerUserId = "";

async function resetLayout() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET "reportMapLayout" = 'FLOW' WHERE id = $1`, [WORKSPACE]);
  } finally {
    await client.end();
  }
}

test.describe("the printed map's layout control", () => {
  test.beforeAll(async () => {
    await makeTenderProcess();
    await resetLayout();

    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await client.query(`DELETE FROM members WHERE "userId" IN (SELECT id FROM users WHERE email = $1)`, [
        VIEWER.email,
      ]);
      await client.query(`DELETE FROM users WHERE email = $1`, [VIEWER.email]);
      viewerUserId = crypto.randomUUID();
      const hash = await bcrypt.hash(VIEWER.password, 10);
      await client.query(
        `INSERT INTO users (id, email, name, "passwordHash", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Viewer Map Layout E2E', $3, now(), now())`,
        [viewerUserId, VIEWER.email, hash]
      );
      await client.query(
        `INSERT INTO members (id, "workspaceId", "userId", "accessLevel", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'VIEWER', 'ACTIVE', now(), now())`,
        [crypto.randomUUID(), WORKSPACE, viewerUserId]
      );
    } finally {
      await client.end();
    }
  });

  test.afterAll(async () => {
    await removeTenderProcess();
    await resetLayout();

    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await client.query(`DELETE FROM members WHERE "userId" = $1`, [viewerUserId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [viewerUserId]);
    } finally {
      await client.end();
    }
  });

  test("an Editor switches the layout in place, and it survives a reload and a new session", async ({
    page,
    browser,
  }) => {
    await signIn(page, E2E_EDITOR);
    await page.goto(`/reports/${WORKSPACE}?ids=${TENDER_PROCESS_ID}`);
    await page.waitForSelector(".printed-map");

    // Starts in Flow, per the reset above.
    await expect(page.locator(".pmap-flow").first()).toBeVisible();
    await expect(page.locator(".pmap-roles")).toHaveCount(0);

    const rolesButton = page.getByRole("button", { name: "Roles" });
    await expect(rolesButton).toBeVisible();
    await rolesButton.click();

    // Redraws without a navigation: still the same document, now Roles.
    await expect(page.locator(".pmap-roles").first()).toBeVisible();
    await expect(page.locator(".pmap-flow")).toHaveCount(0);
    await expect(rolesButton).toHaveAttribute("aria-pressed", "true");

    // Survives a reload of the same page...
    await page.reload();
    await page.waitForSelector(".printed-map");
    await expect(page.locator(".pmap-roles").first()).toBeVisible();

    // ...and a new session entirely, not just this page's client state.
    const freshPage = await (await browser.newContext()).newPage();
    await signIn(freshPage, E2E_EDITOR);
    await freshPage.goto(`/reports/${WORKSPACE}?ids=${TENDER_PROCESS_ID}`);
    await freshPage.waitForSelector(".printed-map");
    await expect(freshPage.locator(".pmap-roles").first()).toBeVisible();
    await freshPage.close();
  });

  test("a Viewer is offered no map layout control", async ({ page }) => {
    await signIn(page, VIEWER);
    await page.goto(`/reports/${WORKSPACE}?ids=${TENDER_PROCESS_ID}`);
    await page.waitForSelector(".printed-map");

    await expect(page.getByText("Map layout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Roles" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Flow" })).toHaveCount(0);
  });
});
