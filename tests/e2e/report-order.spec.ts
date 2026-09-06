import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * A pack's order lives in the report's own link, not in the database. That is
 * what lets one pack be arranged for its audience without disturbing the
 * workspace, the next pack, or anyone else — there is no stored order to write
 * back to. These tests hold both halves of that: the arrangement reaches the
 * report, and nothing else moves.
 */
/**
 * The codes listed on the report's index page, in order. Read from the code
 * badge rather than the row text: a sub-process's row also names its parent
 * ("under PUR100"), so a substring check on the whole row would match the
 * wrong thing.
 */
async function reportIndexCodes(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator("main > section")
    .filter({ hasText: "Processes in This Report" })
    .locator("li span.font-mono")
    .allInnerTexts();
}

test.describe("Export report ordering", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the report follows the order the pack was arranged in", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");

    const rows = page.locator("tbody tr");
    const codeOf = (row: number) => rows.nth(row).locator("td").nth(1).innerText();

    const firstBefore = await codeOf(0);
    const secondBefore = await codeOf(1);
    expect(firstBefore).not.toBe(secondBefore);

    // Move the first process below the second, using the control rather than a
    // drag — the keyboard path has to be the working one.
    await rows.nth(0).getByRole("button", { name: /Move .* later in the report/ }).click();
    await expect.poll(() => codeOf(0)).toBe(secondBefore);
    await expect.poll(() => codeOf(1)).toBe(firstBefore);

    await page.getByRole("button", { name: /Preview report/i }).click();
    await page.waitForURL("**/reports/**");

    // The link carries the arrangement, so the report's own index reflects it.
    const codes = await reportIndexCodes(page);
    expect(codes[0]).toBe(secondBefore);
    expect(codes[1]).toBe(firstBefore);

    // And the arrangement is in the URL itself, which is what makes an
    // arranged report stay arranged when the link is shared.
    const ids = new URL(page.url()).searchParams.getAll("ids");
    expect(ids.length).toBeGreaterThan(1);
  });

  test("re-opening an arranged report's link reproduces its order", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    const rows = page.locator("tbody tr");

    await rows.nth(0).getByRole("button", { name: /Move .* later in the report/ }).click();
    await page.getByRole("button", { name: /Preview report/i }).click();
    await page.waitForURL("**/reports/**");
    const arrangedUrl = page.url();
    const codesWhenArranged = await reportIndexCodes(page);

    // A fresh navigation, as a recipient of the link would make. The order is
    // part of the link, so it survives being shared rather than reverting.
    await page.goto("about:blank");
    await page.goto(arrangedUrl);
    expect(await reportIndexCodes(page)).toEqual(codesWhenArranged);

    // And it is genuinely arranged, not merely stable — code order would put
    // the codes in sorted order, and this pack is not in that order.
    expect(codesWhenArranged).not.toEqual([...codesWhenArranged].sort());
  });

  test("arranging a pack leaves the workspace's own process list alone", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    const libraryBefore = await page.locator("tbody tr td:nth-child(1)").allInnerTexts();

    await page.goto("/workspaces/workspace-acme/export");
    await page
      .locator("tbody tr")
      .nth(0)
      .getByRole("button", { name: /Move .* later in the report/ })
      .click();
    await page.getByRole("button", { name: /Preview report/i }).click();
    await page.waitForURL("**/reports/**");

    // Nothing was written, so the library is exactly as it was.
    await page.goto("/workspaces/workspace-acme/processes");
    const libraryAfter = await page.locator("tbody tr td:nth-child(1)").allInnerTexts();
    expect(libraryAfter).toEqual(libraryBefore);

    // And a fresh export starts from the library order, not the last pack's.
    await page.goto("/workspaces/workspace-acme/export");
    const pickerCodes = await page.locator("tbody tr td:nth-child(2)").allInnerTexts();
    expect(pickerCodes).toEqual([...pickerCodes].sort());
  });

  test("a report link naming a process that no longer exists still renders", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.getByRole("button", { name: /Preview report/i }).click();
    await page.waitForURL("**/reports/**");

    const url = new URL(page.url());
    const ids = url.searchParams.getAll("ids");
    url.searchParams.append("ids", "does-not-exist");
    await page.goto(url.toString());

    // The sequence is a sort, never a filter: an id naming nothing is skipped
    // and the real processes still render, rather than the link being rejected.
    expect(await reportIndexCodes(page)).toHaveLength(ids.length);
  });
});
