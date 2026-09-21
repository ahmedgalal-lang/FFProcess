import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { signIn } from "./sign-in";

/**
 * The processes list must show every process in the workspace.
 *
 * Reported from production: a process created as a sub-process of a
 * sub-process was not on the list. It existed, it opened by URL, and
 * searching found it — because search shows every match flat and skips the
 * grouping — but it was not there to be found by looking, which is how
 * anyone would actually look for it.
 */
const WORKSPACE = "workspace-acme";
const IDS = ["deep-parent", "deep-child", "deep-grandchild"] as const;

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function makeNestedProcesses() {
  await removeNestedProcesses();
  await withClient(async (c) => {
    const rows: [string, string, string, string | null][] = [
      ["deep-parent", "DEEP100", "Tender programme", null],
      ["deep-child", "DEEP200", "Tender stage", "deep-parent"],
      ["deep-grandchild", "DEEP300", "Tender package", "deep-child"],
    ];
    for (const [id, code, name, parent] of rows) {
      await c.query(
        `INSERT INTO processes (id, "workspaceId", code, name, "parentProcessId",
                                "raciVisibleRoleIds", "inScope", "outOfScope",
                                "externalEntities", kpis, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, '{}', '{}', '{}', '[]', '[]', now(), now())`,
        [id, WORKSPACE, code, name, parent]
      );
    }
  });
}

async function removeNestedProcesses() {
  await withClient(async (c) => {
    // Children first: the parent link is a foreign key.
    for (const id of [...IDS].reverse()) {
      await c.query(`DELETE FROM processes WHERE id = $1`, [id]);
    }
  });
}

test.beforeAll(makeNestedProcesses);
test.afterAll(removeNestedProcesses);

test("a sub-process of a sub-process is on the list, not only findable by search", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes`);

  // Matched on the code column specifically: a sub-process also names its
  // parent's code in its own name cell ("sub-process of DEEP200"), so a
  // looser match finds two cells and proves nothing about which row exists.
  const codeCell = (code: string) =>
    page.locator("td.font-mono").filter({ hasText: new RegExp(`^↳*${code}$`) });

  // The parent and the middle process were always listed; the grandchild is
  // the one that used to vanish.
  await expect(codeCell("DEEP100")).toHaveCount(1);
  await expect(codeCell("DEEP200")).toHaveCount(1);
  await expect(
    codeCell("DEEP300"),
    "a process nested two levels deep is missing from the list"
  ).toHaveCount(1);
  await expect(page.getByRole("cell", { name: /^Tender package/ })).toBeVisible();

  // ...and nested under its own parent, not appended somewhere at the end.
  // The implementation has a catch-all that puts any process the tree walk
  // missed back on the list, so "it is present" alone passes even when the
  // walk is broken — the position is what actually proves the nesting works.
  const codes = await page.locator("td.font-mono").allInnerTexts();
  const seen = codes.map((t) => t.replace(/[^A-Z0-9]/g, ""));
  const at = (code: string) => seen.indexOf(code);
  expect(at("DEEP200"), "the middle process follows its parent").toBe(at("DEEP100") + 1);
  expect(at("DEEP300"), "the deepest process follows its own parent").toBe(at("DEEP200") + 1);
});

test("searching still finds it, and still shows it flat", async ({ page }) => {
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes?q=Tender+package`);
  await expect(page.locator("td.font-mono").filter({ hasText: /DEEP300/ })).toHaveCount(1);
});

test("a process whose parent was deleted is still listed", async ({ page }) => {
  // The other way a row used to be dropped: nowhere to nest, so nowhere at all.
  await withClient(async (c) => {
    await c.query(`UPDATE processes SET "archivedAt" = now() WHERE id = 'deep-child'`);
  });
  try {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/processes`);
    await expect(
      page.locator("td.font-mono").filter({ hasText: /DEEP300/ }),
      "a process whose parent is hidden must still be listed"
    ).toHaveCount(1);
  } finally {
    await withClient(async (c) => {
      await c.query(`UPDATE processes SET "archivedAt" = NULL WHERE id = 'deep-child'`);
    });
  }
});
