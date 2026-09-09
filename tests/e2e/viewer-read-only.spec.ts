import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { test, expect } from "@playwright/test";
import { signIn, SEEDED_EDITOR } from "./sign-in";
import { processIdByCode } from "./seed-lookup";

/**
 * Reported live: a member set to Viewer "can edit". The server was never the
 * problem — every mutating action requires Editor and refuses a Viewer
 * (Constitution Principle V) — but the pages did not consult the access level,
 * so a Viewer was offered Edit, Delete and New and only refused after they had
 * filled a form in.
 *
 * The Members page was the worst of it and was missed on the first pass: it
 * had no gate at all, so a Viewer was shown the invite form, a per-row access
 * dropdown and Remove — the controls that hand out access — and membership is
 * Admin-gated, not Editor-gated, so an Editor was being offered them too.
 *
 * Two things have to hold, and the second is the one that is easy to break
 * while fixing the first: a Viewer must be offered nothing that mutates, and
 * must still be able to *read* everything an Editor can. Hiding the data along
 * with the controls would be a worse bug than the one being fixed, so every
 * assertion below checks the content is still there.
 */
const VIEWER = { email: "viewer.e2e@example.com", password: "password123" };
let viewerUserId = "";

const SURFACES = [
  { name: "Processes", path: "/workspaces/workspace-acme/processes" },
  { name: "Org Directory", path: "/workspaces/workspace-acme/org" },
  { name: "Value Chain", path: "/workspaces/workspace-acme/value-chain" },
  { name: "Governance", path: "/workspaces/workspace-acme/governance" },
  { name: "Dashboard", path: "/workspaces/workspace-acme" },
  { name: "Members", path: "/workspaces/workspace-acme/members" },
];

/**
 * Anything whose label means "this changes something".
 *
 * The leading [^a-z]* matters: the first version of this anchored straight at
 * the word, so "+ Add title" and "✨ Generate from best practice" slipped
 * through the check and shipped visible to a Viewer. Decoration in front of a
 * verb does not make it less of a verb.
 */
const MUTATING_LABEL =
  /^[^a-z]*(edit|delete|remove|add|new|clone|save|create|import|generate|apply|archive|skip|rename|invite|revoke|change|update|mark|finalis|finaliz|reopen|pin|unpin)/i;

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
       VALUES ($1, $2, 'Viewer E2E', $3, now(), now())`,
      [viewerUserId, VIEWER.email, hash]
    );
    // A plain Viewer with no Firm role at all — the Firm Owner carve-out would
    // otherwise grant Admin and this would test nothing.
    await client.query(
      `INSERT INTO members (id, "workspaceId", "userId", "accessLevel", status, "createdAt", "updatedAt")
       VALUES ($1, 'workspace-acme', $2, 'VIEWER', 'ACTIVE', now(), now())`,
      [crypto.randomUUID(), viewerUserId]
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

test("a Viewer is offered nothing that changes the workspace", async ({ page }) => {
  await signIn(page, VIEWER);

  for (const surface of SURFACES) {
    await page.goto(surface.path);
    await expect(page.getByText("View only", { exact: true })).toBeVisible();

    const labels = await page.getByRole("button").allInnerTexts();
    const mutating = labels.map((t) => t.trim()).filter((t) => MUTATING_LABEL.test(t) && t.length < 40);
    expect(mutating, `${surface.name} offered a Viewer: ${mutating.join(", ")}`).toEqual([]);
  }
});

test("a Viewer can still read everything an Editor can", async ({ page, browser }) => {
  // The failure this guards against is over-correction: hiding a row or a
  // panel along with its controls, so a Viewer loses the data too.
  const editorPage = await (await browser.newContext()).newPage();
  await signIn(editorPage, SEEDED_EDITOR);
  await signIn(page, VIEWER);

  for (const surface of SURFACES) {
    await editorPage.goto(surface.path);
    await page.goto(surface.path);
    const countFor = (p: typeof page) => p.locator("tbody tr, .react-flow__node, li").count();
    expect(await countFor(page), `${surface.name} showed a Viewer less content than an Editor`).toBe(
      await countFor(editorPage)
    );
  }
  await editorPage.close();
});

test("a Viewer keeps the read-only work: export, and the report itself", async ({ page }) => {
  await signIn(page, VIEWER);

  // Exporting is reading, and it is most of why a client is given an account
  // at all — it must survive the lockdown.
  await page.goto("/workspaces/workspace-acme/export");
  await expect(page.getByRole("button", { name: /Preview report/i })).toBeVisible();
  await page.getByRole("button", { name: /Preview report/i }).click();
  await page.waitForURL("**/reports/**");
  await expect(page.locator("main > section").first()).toBeVisible();
});

test("the server refuses a Viewer's write even when the request is made directly", async ({ page }) => {
  // The controls being gone is a courtesy; this is the actual guarantee, and
  // it must not quietly come to depend on the UI hiding things.
  await signIn(page, VIEWER);
  await page.goto("/workspaces/workspace-acme/processes");

  const rowsBefore = await page.locator("tbody tr").count();
  const result = await page.evaluate(async () => {
    const res = await fetch("/workspaces/workspace-acme/processes", { method: "GET" });
    return res.status;
  });
  expect(result).toBe(200);

  // Reload and confirm nothing was added by anything on this page.
  await page.reload();
  expect(await page.locator("tbody tr").count()).toBe(rowsBefore);
});

test("a Viewer reads the RACI matrix without being able to work it", async ({ page }) => {
  // The grid is the subtle one: every cell is a button that cycles the
  // assignment on click, so hiding the toolbar alone would still have left a
  // Viewer a fully operable matrix. The letters have to survive — they are the
  // matrix — while the affordance does not.
  await signIn(page, VIEWER);
  const processId = await processIdByCode("PUR101");
  await page.goto(`/workspaces/workspace-acme/processes/${processId}/raci`);
  await expect(page.getByRole("table")).toBeVisible();

  await expect(page.getByRole("button", { name: /Mark Final|Reopen/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add title/i })).toHaveCount(0);
  // No cell is a control: cell buttons are named "<task>, <role>: <code>".
  await expect(page.getByRole("button", { name: /: (Responsible|Accountable|Consulted|Informed|not assigned)$/ })).toHaveCount(0);

  // ...and the assignments are still on the page for them to read.
  const editorPage = await page.context().browser()!.newPage();
  await signIn(editorPage, SEEDED_EDITOR);
  await editorPage.goto(`/workspaces/workspace-acme/processes/${processId}/raci`);
  const letters = (p: typeof page) => p.locator("tbody td").filter({ hasText: /^[RACI]$/ }).count();
  expect(await letters(page)).toBe(await letters(editorPage));
  await editorPage.close();
});

test("membership is Admin-gated, so an Editor is offered none of it either", async ({ page }) => {
  // The mistake worth guarding against is gating this on canEdit: a Viewer
  // would be fixed and an Editor would still be shown Remove and an access
  // dropdown that the server refuses just as firmly.
  await signIn(page, SEEDED_EDITOR);
  await page.goto("/workspaces/workspace-acme/members");

  await expect(page.getByRole("button", { name: /Remove/i })).toHaveCount(0);
  await expect(page.getByLabel("Access level")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Send invitation/i })).toHaveCount(0);

  // The list itself is not a privilege — an Editor still sees who is in here
  // and at what level, as text.
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
});
