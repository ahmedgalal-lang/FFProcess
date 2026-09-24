import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeStepJoinProcess, removeStepJoinProcess, JOIN_PROCESS_CODE } from "../fixtures/step-join-process";

/**
 * The reported gap: "sometimes in a process, 2 separate steps deliver an
 * outcome that are needed (both) to start another step" — and nothing
 * distinguished that from an ordinary either/or convergence, because the
 * Steps List's per-row editor only ever showed one predecessor at a time
 * (spec 015). This drives the real Steps List: opening a step that already
 * has two incoming connections and seeing both, adding/removing predecessors
 * independently, and marking a step as needing every one of them — with the
 * unmarked case reading exactly as an ordinary convergence always has.
 */
const WORKSPACE = "workspace-acme";

async function openStepsList(page: import("@playwright/test").Page) {
  await page.goto(`/workspaces/${WORKSPACE}/processes`);
  await page.locator("tr", { hasText: JOIN_PROCESS_CODE }).first().locator("text=Open").click();
  await page.waitForURL("**/map");
  await page.click('button:has-text("Steps List")');
}

test.describe("the step join requirement", () => {
  test.beforeEach(makeStepJoinProcess);
  test.afterAll(removeStepJoinProcess);

  test("a step with two pre-existing predecessors shows both in its editor", async ({ page }) => {
    await signIn(page);
    await openStepsList(page);

    await expect(page.getByText("Connects from: Legal sign-off and Client sign-off")).toBeVisible();

    await page.getByLabel("Edit End").click();
    const editForm = page.locator("div.border-indigo-200").first();
    const connectsFrom = editForm.getByLabel("Connects from");
    await expect(connectsFrom).toHaveCount(2);
    // Both are pre-filled from the real connections, not left unset.
    await expect(connectsFrom.nth(0)).not.toHaveValue("");
    await expect(connectsFrom.nth(1)).not.toHaveValue("");
  });

  test("adding a predecessor creates a real connection, and removing one leaves the others untouched", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    // "Legal sign-off" starts with just its one predecessor, "Start".
    await page.getByLabel("Edit Legal sign-off").click();
    let editForm = page.locator("div.border-indigo-200").first();
    await expect(editForm.getByLabel("Connects from")).toHaveCount(1);

    await editForm.getByRole("button", { name: "+ Add predecessor" }).click();
    await editForm.getByLabel("Connects from").nth(1).selectOption("[Task] Client sign-off");
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    await expect(page.getByText("Connects from: Start and Client sign-off")).toBeVisible();
    // "End"'s own predecessors are untouched by editing a different step.
    await expect(page.getByText("Connects from: Legal sign-off and Client sign-off")).toBeVisible();

    // Now remove the one just added — back to a single predecessor.
    await page.getByLabel("Edit Legal sign-off").click();
    editForm = page.locator("div.border-indigo-200").first();
    await expect(editForm.getByLabel("Connects from")).toHaveCount(2);
    await editForm.getByLabel("Remove this predecessor").nth(1).click();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    // "Client sign-off" also reads "Connects from: Start" (its own,
    // unrelated predecessor) — scope to "Legal sign-off"'s own row.
    const legalRow = page.locator("div.rounded-xl", { hasText: "Legal sign-off" });
    await expect(legalRow.getByText("Connects from: Start", { exact: true })).toBeVisible();
  });

  test("marking a step as needing all predecessors changes its wording; leaving it default does not", async ({
    page,
  }) => {
    await signIn(page);
    await openStepsList(page);

    // Default: reads exactly like an ordinary convergence.
    await expect(page.getByText("Connects from: Legal sign-off and Client sign-off")).toBeVisible();

    await page.getByLabel("Edit End").click();
    let editForm = page.locator("div.border-indigo-200").first();
    await editForm.getByLabel("Requires all predecessors").check();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    await expect(page.getByText(/Needs (both|all of).*Legal sign-off.*Client sign-off/)).toBeVisible();
    await expect(page.getByText("Connects from: Legal sign-off and Client sign-off")).toHaveCount(0);

    // Turn it back off — reads exactly as it did before, nothing left over (SC-004).
    await page.getByLabel("Edit End").click();
    editForm = page.locator("div.border-indigo-200").first();
    await editForm.getByLabel("Requires all predecessors").uncheck();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    await expect(page.getByText("Connects from: Legal sign-off and Client sign-off")).toBeVisible();
  });

  test("a step's rule survives an unrelated edit (renaming it) untouched", async ({ page }) => {
    await signIn(page);
    await openStepsList(page);

    await page.getByLabel("Edit End").click();
    let editForm = page.locator("div.border-indigo-200").first();
    await editForm.getByLabel("Requires all predecessors").check();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    await page.getByLabel("Edit End").click();
    editForm = page.locator("div.border-indigo-200").first();
    await editForm.getByLabel("Step name").fill("Process complete");
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);

    await page.reload();
    await page.click('button:has-text("Steps List")');
    await expect(page.getByText(/Needs (both|all of).*Legal sign-off.*Client sign-off/)).toBeVisible();
  });
});
