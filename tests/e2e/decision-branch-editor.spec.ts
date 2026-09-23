import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import {
  makeDecisionBranchProcess,
  removeDecisionBranchProcess,
  DECISION_PROCESS_CODE,
} from "../fixtures/decision-branch-process";

/**
 * The reported gap: "the yes and no in the decision is not implemented" —
 * every step type showed one identical free-text "Connector label" field
 * with a "Yes / No" placeholder hint, with nothing distinguishing a
 * Decision's own branching from an ordinary step's single connector, and no
 * way to manage a decision's branches from the decision's own row (spec
 * 014). This drives the real Steps List: adding a Decision step, seeing the
 * branch editor appear beside (not instead of) the existing fields, filling
 * both branches, and confirming the connections land where expected — on
 * the Steps List, and on the live canvas, which already renders a
 * connection's own label per edge and needed no changes.
 */
const WORKSPACE = "workspace-acme";
const VIEWER = { email: "viewer.decisionbranch.e2e@example.com", password: "password123" };
let viewerUserId = "";

async function openStepsList(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await page.locator("tr", { hasText: DECISION_PROCESS_CODE }).first().locator("text=Open").click();
  await page.waitForURL("**/map");
  await page.click('button:has-text("Steps List")');
}

test.describe("the decision branch editor", () => {
  test.beforeEach(makeDecisionBranchProcess);
  test.afterAll(removeDecisionBranchProcess);

  test("appears only for Decision, alongside the existing connects-from field, never replacing it", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    const addForm = page.locator("form").filter({ hasText: "+ Add Step" }).first();
    // A plain getByLabel("Connects from") also matches the unrelated "Insert"
    // field, whose own first option's text is "after the step it connects
    // from" — the browser folds a wrapping label's full text, options
    // included, into the select's computed accessible name. Anchoring to the
    // start of the <label> element's own text avoids that collision.
    const connectsFromField = addForm.locator("label", { hasText: /^Connects from/ });
    await expect(addForm.getByLabel("Branch label").first()).toHaveCount(0);
    await expect(connectsFromField).toBeVisible();

    await addForm.getByLabel("Type").selectOption("DECISION");
    await expect(addForm.getByLabel("Branch label").first()).toBeVisible();
    // The existing field is untouched by the branch editor appearing.
    await expect(connectsFromField).toBeVisible();

    await addForm.getByLabel("Type").selectOption("TASK");
    await expect(addForm.getByLabel("Branch label").first()).toHaveCount(0);
    await expect(connectsFromField).toBeVisible();
  });

  test("a Yes branch to a new step and a No branch to an existing, earlier step both create real connections", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    const addForm = page.locator("form").filter({ hasText: "+ Add Step" }).first();
    await addForm.getByLabel("Step name").fill("Over budget?");
    await addForm.getByLabel("Type").selectOption("DECISION");
    // "Connects from" defaults to the last step in the list ("End"), which
    // would otherwise wire this decision in backwards; connect it from
    // "Check budget" like every other step added mid-flow.
    await addForm.locator("label", { hasText: /^Connects from/ }).locator("select").selectOption("[Task] Check budget");

    const boxes = addForm.locator(".border-slate-200.bg-white.p-2");
    // Box 1 ("Yes"): create a new step.
    await boxes.nth(0).getByLabel("Branch leads to").selectOption("new");
    await boxes.nth(0).getByLabel("New step name").fill("Escalate to CFO");
    // Box 2 ("No"): loop back to the fixture's "Start" step — an earlier
    // step, not the decision's own immediate predecessor, so this exercises
    // a real loop-back without also creating a tight two-node cycle.
    await boxes.nth(1).getByLabel("Branch leads to").selectOption("existing");
    await boxes.nth(1).getByLabel("Existing step").selectOption("[Start] Start");

    await addForm.getByRole("button", { name: "+ Add Step" }).click();
    await expect(page.getByText("Over budget?", { exact: true })).toBeVisible();
    await expect(page.getByText("Escalate to CFO", { exact: true })).toBeVisible();

    // Both connections show on the live canvas, each with its own label —
    // process-map-canvas.tsx already renders a connection's own label per
    // edge (FR-013), so no change was needed there for this to work.
    await page.click('button:has-text("Diagram")');
    await page.waitForSelector(".react-flow__edge-path");
    // SVG <text> elements have no .innerText, only .textContent — allTextContents() reads that.
    const edgeLabels = await page.locator(".react-flow__edge-textwrapper").allTextContents();
    expect(edgeLabels).toEqual(expect.arrayContaining(["Yes", "No"]));
  });

  test("reopening an existing Decision's branch editor shows its real connections, pre-filled (FR-009)", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    // Create the decision with one branch first. "Connects from" defaults to
    // the last step in the list ("End"); connect it from "Check budget" like
    // any step added mid-flow instead.
    const addForm = page.locator("form").filter({ hasText: "+ Add Step" }).first();
    await addForm.getByLabel("Step name").fill("Client responds?");
    await addForm.getByLabel("Type").selectOption("DECISION");
    await addForm.locator("label", { hasText: /^Connects from/ }).locator("select").selectOption("[Task] Check budget");
    const addBoxes = addForm.locator(".border-slate-200.bg-white.p-2");
    await addBoxes.nth(0).getByLabel("Branch leads to").selectOption("existing");
    await addBoxes.nth(0).getByLabel("Existing step").selectOption("[Start] Start");
    await addForm.getByRole("button", { name: "+ Add Step" }).click();
    await expect(page.getByText("Client responds?", { exact: true })).toBeVisible();

    // Reopen it: the row's own edit affordance, not the add form.
    await page.getByLabel("Edit Client responds?").click();

    // Not scoped by step name text: in edit mode the step name lives in an
    // <input value>, which contributes nothing to matchable text content.
    // Exactly one row is in edit mode at a time here.
    const editForm = page.locator("div.border-indigo-200").first();
    const editBoxes = editForm.locator(".border-slate-200.bg-white.p-2");
    // The Yes branch pre-filled from the connection just created, and the No
    // branch still unset — seedBranchDrafts pads with whichever of "Yes"/"No"
    // isn't already taken.
    await expect(editBoxes.nth(0).getByLabel("Branch label")).toHaveValue("Yes");
    await expect(editBoxes.nth(0).getByLabel("Branch leads to")).toHaveValue("existing");
    await expect(editBoxes.nth(1).getByLabel("Branch label")).toHaveValue("No");

    // Rename it and save — a label change, not a destination change.
    await editBoxes.nth(0).getByLabel("Branch label").fill("Not yet");
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Not yet/)).toBeVisible();
  });

  test("a decision can outgrow two outcomes, and each branch is independently editable and removable", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    const addForm = page.locator("form").filter({ hasText: "+ Add Step" }).first();
    await addForm.getByLabel("Step name").fill("Which region?");
    await addForm.getByLabel("Type").selectOption("DECISION");
    await addForm.locator("label", { hasText: /^Connects from/ }).locator("select").selectOption("[Task] Check budget");

    let boxes = addForm.locator(".border-slate-200.bg-white.p-2");
    await boxes.nth(0).getByLabel("Branch leads to").selectOption("new");
    await boxes.nth(0).getByLabel("New step name").fill("Route to EMEA");
    await boxes.nth(1).getByLabel("Branch leads to").selectOption("new");
    await boxes.nth(1).getByLabel("New step name").fill("Route to APAC");

    // A third outcome, beyond the default two — not constrained to Yes/No.
    await addForm.getByRole("button", { name: "+ Add another outcome" }).click();
    boxes = addForm.locator(".border-slate-200.bg-white.p-2");
    await expect(boxes).toHaveCount(3);
    await boxes.nth(2).getByLabel("Branch label").fill("Americas");
    await boxes.nth(2).getByLabel("Branch leads to").selectOption("new");
    await boxes.nth(2).getByLabel("New step name").fill("Route to Americas");

    await addForm.getByRole("button", { name: "+ Add Step" }).click();
    await expect(page.getByText("Which region?", { exact: true })).toBeVisible();
    await expect(page.getByText("Route to EMEA", { exact: true })).toBeVisible();
    await expect(page.getByText("Route to APAC", { exact: true })).toBeVisible();
    await expect(page.getByText("Route to Americas", { exact: true })).toBeVisible();

    // Reopen: all three branches are there, independently editable...
    await page.getByLabel("Edit Which region?").click();
    const editForm = page.locator("div.border-indigo-200").first();
    let editBoxes = editForm.locator(".border-slate-200.bg-white.p-2");
    await expect(editBoxes).toHaveCount(3);
    await expect(editBoxes.nth(2).getByLabel("Branch label")).toHaveValue("Americas");

    // ...and removable: dropping the third leaves the other two intact.
    await editBoxes.nth(2).getByLabel("Remove this branch").click();
    editBoxes = editForm.locator(".border-slate-200.bg-white.p-2");
    await expect(editBoxes).toHaveCount(2);
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0); // back to the collapsed row

    // Re-fetch from the server rather than racing router.refresh(): a click
    // straight after Save can land before the refreshed props arrive.
    await page.reload();
    await page.click('button:has-text("Steps List")');
    await page.getByLabel("Edit Which region?").click();
    const reeditForm = page.locator("div.border-indigo-200").first();
    await expect(reeditForm.locator(".border-slate-200.bg-white.p-2")).toHaveCount(2);
  });

  test("a Viewer is offered no way to add, edit, or move a step, including its branches", async ({ page }) => {
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
         VALUES ($1, $2, 'Viewer Decision Branch E2E', $3, now(), now())`,
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

    try {
      await signIn(page, VIEWER);
      await openStepsList(page);

      // The add form hides itself entirely for a non-editor (existing behavior).
      await expect(page.locator("form").filter({ hasText: "+ Add Step" })).toHaveCount(0);

      // And the per-row controls this feature is built on top of — the
      // pre-existing gap T005 closed — are gone too, for every step.
      await expect(page.getByLabel(/^Edit /)).toHaveCount(0);
      await expect(page.getByLabel(/^Delete /)).toHaveCount(0);
      await expect(page.getByLabel(/^Move .* up$/)).toHaveCount(0);
      await expect(page.getByLabel(/^Move .* down$/)).toHaveCount(0);
    } finally {
      const cleanupClient = new Client({ connectionString: process.env["DATABASE_URL"] });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(`DELETE FROM members WHERE "userId" = $1`, [viewerUserId]);
        await cleanupClient.query(`DELETE FROM users WHERE id = $1`, [viewerUserId]);
      } finally {
        await cleanupClient.end();
      }
    }
  });
});
