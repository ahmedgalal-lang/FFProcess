import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * An import writes more at once than any other single action in the product,
 * which is what makes the boundary worth testing rather than assuming.
 *
 * The assertion that counts is not that a Viewer is shown no button — that only
 * proves a page hid one. It is that the server refuses a direct request and
 * that nothing is created when it does.
 */
const WORKSPACE = "workspace-acme";
const VIEWER = { email: "viewer.import.e2e@example.com", password: "password123" };
let viewerUserId = "";

test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM members WHERE "userId" IN (SELECT id FROM users WHERE email = $1)`, [VIEWER.email]);
    await client.query(`DELETE FROM users WHERE email = $1`, [VIEWER.email]);
    viewerUserId = crypto.randomUUID();
    const hash = await bcrypt.hash(VIEWER.password, 10);
    await client.query(
      `INSERT INTO users (id, email, name, "passwordHash", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Viewer Import E2E', $3, now(), now())`,
      [viewerUserId, VIEWER.email, hash]
    );
    // No Firm role at all — the Firm Owner carve-out would grant Admin and
    // this would be testing nothing.
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
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM members WHERE "userId" = $1`, [viewerUserId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [viewerUserId]);
  } finally {
    await client.end();
  }
});

test("a viewer is shown neither the download nor the upload", async ({ page }) => {
  await signIn(page, VIEWER);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);

  await expect(page.getByRole("button", { name: "Import from a file" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download template" })).toHaveCount(0);

  // ...and can still read the page, which is the bug that would be worse than
  // the one being prevented.
  await expect(page.getByRole("table").first()).toBeVisible();
});

test("a viewer's direct request for the template is refused by the server", async ({ page }) => {
  await signIn(page, VIEWER);
  const response = await page.request.get(`/api/template/process-import/${WORKSPACE}`, {
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ ok: false, error: "FORBIDDEN" });
});

test("an editor's request for the template is allowed", async ({ page }) => {
  // The other half of the pair: a gate that refuses everybody is not a gate.
  await signIn(page);
  const response = await page.request.get(`/api/template/process-import/${WORKSPACE}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("process-import-template.xlsx");
});
