import { test, expect } from "@playwright/test";

// NOTE: runs against the same dev database seeded by `pnpm db:seed` (see
// prisma/seed.ts) rather than an isolated test database — a dedicated test DB
// is a follow-up (tasks.md T031/T039 assume "a seeded test database"; this is
// the pragmatic version discovered while building the MVP slice).

test.describe("Core workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]'); // seeded Firm Owner credentials are pre-filled
    await page.waitForURL("**/workspaces");
  });

  test("Firm Owner reaches Acme Industrial via the workspace picker", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("All Clients");
    await page.click("text=Acme Industrial");
    await page.waitForURL("**/workspaces/**");
    await expect(page.locator("h1")).toHaveText("Acme Industrial");
  });

  test("Process Map shows the seeded Purchase-to-Pay steps and cross-process links", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");

    await expect(page.locator("h1")).toContainText("Purchase-to-Pay");

    // Diagram view (default): React Flow renders one node per step plus one per
    // swimlane — three roles, plus an Unassigned lane for the seeded Start step,
    // which has no role and so belongs to no role's lane.
    const laneText = /^(AP Clerk|Finance Manager|Procurement Lead|Unassigned)$/i;
    const laneNodes = page.locator(".react-flow__node").filter({ hasText: laneText });
    await expect(laneNodes).toHaveCount(4);
    const stepNodes = page.locator(".react-flow__node").filter({ hasNotText: laneText });
    await expect(stepNodes).toHaveCount(9);
    await expect(page.locator("text=🔗 PUR102")).toBeVisible();
    await expect(page.locator("text=🔗 SAL101")).toBeVisible();

    // Every step sits inside its own role's lane. This used to be wrong: lanes
    // were drawn from the roles but nodes were placed from a coordinate frozen
    // when the step was created, so a role assigned later left the node behind.
    const laneTop = async (name: string) =>
      (await laneNodes.filter({ hasText: new RegExp(`^${name}$`, "i") }).boundingBox())!.y;
    const stepTop = async (label: string) =>
      (await stepNodes.filter({ hasText: label }).first().boundingBox())!.y;

    const [apClerk, financeManager, procurementLead, unassigned] = await Promise.all([
      laneTop("AP Clerk"),
      laneTop("Finance Manager"),
      laneTop("Procurement Lead"),
      laneTop("Unassigned"),
    ]);

    // A step's top edge falls inside its lane's band, between that lane's top
    // and the next lane's.
    expect(await stepTop("Create Purchase Order")).toBeGreaterThan(apClerk!);
    expect(await stepTop("Create Purchase Order")).toBeLessThan(financeManager!);
    expect(await stepTop("Approve PO?")).toBeGreaterThan(financeManager!);
    expect(await stepTop("Approve PO?")).toBeLessThan(procurementLead!);
    expect(await stepTop("Receive Goods")).toBeGreaterThan(procurementLead!);
    expect(await stepTop("Receive Goods")).toBeLessThan(unassigned!);
    expect(await stepTop("Start")).toBeGreaterThan(unassigned!);

    // Steps List view: same 9 steps, rendered as boxes instead of a diagram.
    await page.click('button:has-text("Steps List")');
    const steps = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5");
    await expect(steps).toHaveCount(9);
  });

  test("A step's cross-process link can be added and removed after the step already exists", async ({ page }) => {
    // Links used to be settable only when a step was first created — editing
    // an existing one had no way to add a hand-off short of deleting and
    // recreating it. "Receive Goods" is seeded with no link at all.
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("Steps List")');

    const row = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5").filter({
      hasText: "Receive Goods",
    });
    await expect(row.getByText(/🔗/)).toHaveCount(0);

    // Editing replaces the row with a form (a different container, not just a
    // state change within it), so it's queried by its own distinct styling
    // rather than through the pre-edit `row` locator — and scoped away from
    // the Add Step form's own "Link to other process(es)" checkboxes further
    // down the page, which share the same labels.
    const editForm = page.locator("div.border-indigo-200.bg-indigo-50\\/40");

    await row.getByRole("button", { name: "Edit Receive Goods" }).click();
    await editForm.getByLabel(/PUR102/).check();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("🔗 PUR102")).toBeVisible();

    // Reflects on reload too — it's a real saved link, not just local state.
    // Reload resets the Process Map view back to its Diagram default, so
    // Steps List has to be re-selected before the row locator means anything.
    await page.reload();
    await page.click('button:has-text("Steps List")');
    const reloadedRow = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5").filter({
      hasText: "Receive Goods",
    });
    await expect(reloadedRow.getByText("🔗 PUR102")).toBeVisible();

    await reloadedRow.getByRole("button", { name: "Edit Receive Goods" }).click();
    await editForm.getByLabel(/PUR102/).uncheck();
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(reloadedRow.getByText(/🔗/)).toHaveCount(0);
  });

  test("Steps List says what each step still needs, agreeing with the matrices", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("Steps List")');

    const row = (label: string) =>
      page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5").filter({ hasText: label }).first();

    // The seeded gaps, named on the step itself rather than only on the page
    // that validates them.
    await expect(row("Send PO to Vendor")).toContainText("no accountable");
    await expect(row("Send PO to Vendor")).toContainText("no approver");
    await expect(row("Receive Goods")).toContainText("no accountable");

    // A step that is fully documented says nothing — the chip is a gap list,
    // not a status badge, so a quiet row means there is nothing to do.
    await expect(row("Pay Vendor")).not.toContainText("⚠");

    // A START step legitimately begins the flow, so it is never asked what
    // connects into it. Asserted on the chip, since the row separately carries
    // its own "Entry point — no predecessor" line.
    await expect(row("Start").locator("span", { hasText: "⚠" }).first()).toHaveText(
      "⚠ no accountable · no responsible"
    );

    // And the chips agree with the matrices they summarise: an authority row
    // can hang off a step's Activity rather than the step, and reading only
    // the step reported approvers as missing when they were not.
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.goto(page.url().replace("/map", "/authority"));
    const flaggedInMatrix = page.locator("tbody tr").filter({ hasText: "Create Purchase Order" });
    await expect(flaggedInMatrix).not.toContainText("has a validation issue");
  });

  test("RACI matrix flags the seeded validation gap and blocks finalization", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");

    await expect(page.getByText(/\d+ tasks? missing an Accountable or Responsible — finalization blocked/)).toBeVisible();
    await expect(page.locator('button:has-text("Mark Final")')).toBeDisabled();
  });

  test("Authority Matrix shows SLA, amount, direction, approval, co-approval and escalation per task", async ({
    page,
  }) => {
    await page.goto("/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/authority");
    await expect(page.locator("h1")).toHaveText("Authority Matrix");

    // Columns read in the order a rule plays out.
    const headers = await page.locator("thead th").allInnerTexts();
    expect(headers.map((h) => h.trim().toUpperCase())).toEqual([
      "TASK",
      "SLA",
      "AMOUNT",
      "DIRECTION",
      "APPROVAL",
      "CO-APPROVAL",
      "ESCALATION",
      "ACTIONS",
    ]);

    const createPORow = page.locator("tr", { hasText: "Create Purchase Order" }).first();
    await expect(createPORow).toContainText("2 days");
    await expect(createPORow).toContainText("$10,000");
    await expect(createPORow).toContainText("More than");
    await expect(createPORow).toContainText("AP Clerk");
    await expect(createPORow).toContainText("Procurement Lead"); // escalation

    // Each row states its rule as a sentence, built from the same data.
    await expect(
      page.getByText("More than $10,000 needs approval from AP Clerk, within 2 days.", { exact: false })
    ).toBeVisible();

    // "At or above" is a distinct direction from "More than".
    const approvePORow = page.locator("tr", { hasText: "Approve Purchase Order" }).first();
    await expect(approvePORow).toContainText("At or above");
    await expect(approvePORow).toContainText("$100,000");

    // A task with no approval gate is marked as such and dimmed.
    const revisePORow = page.locator("tr", { hasText: "Revise Purchase Order" }).first();
    await expect(revisePORow).toContainText("3 days");
    await expect(revisePORow).toContainText("Equal — no approval");
    await expect(page.getByText(/No approval required — this step proceeds on its own/)).toBeVisible();
  });

  test("Export Report renders as a clean, chrome-free, read-only document", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await expect(page.locator("h1")).toHaveText("Export Report");
    await expect(page.locator("tr", { hasText: "PUR101" })).toBeVisible();

    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    await expect(page.locator("h1")).toHaveText("Acme Industrial");
    await expect(page.getByText("Org Structure")).toBeVisible();
    await expect(page.getByText("Business Process Documentation & Procedure Standard").first()).toBeVisible();

    // No app chrome: the workspace sidebar and top app header must not render here.
    await expect(page.getByRole("link", { name: "Org Directory" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All workspaces" })).toHaveCount(0);
    await expect(page.getByText("FFProcess", { exact: true })).toHaveCount(0);

    // Read-only: no AI-draft button, and no editable inputs anywhere in the report.
    await expect(page.locator('button:has-text("Draft narrative with AI")')).toHaveCount(0);
    await expect(page.locator("main textarea")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);

    // RACI and Authority are combined into one matrix, with real seeded data.
    // The authority side is broken into the same columns the Authority Matrix uses,
    // rather than crammed into one cell.
    const matrixHeaders = await page.locator("table thead th").allInnerTexts();
    expect(matrixHeaders.map((h) => h.trim().toUpperCase())).toEqual(
      expect.arrayContaining(["SLA", "AMOUNT", "DIRECTION", "APPROVAL", "CO-APPROVAL", "ESCALATION"])
    );
    await expect(page.locator("tr", { hasText: "Create Purchase Order" }).filter({ hasText: "$10,000" })).toHaveCount(1);

    // Key Control Points, derived from real co-approval data, surface a real gap in the seed.
    await expect(page.getByText("Key Control Points").first()).toBeVisible();
    await expect(page.getByText(/no co-approver is assigned/).first()).toBeVisible();

    // Undocumented sections are skipped in the report, but named in a preview-only banner.
    const banner = page.getByText(/Some sections are missing content/);
    await expect(banner).toBeVisible();
    await expect(page.getByText(/Process Purpose not written/).first()).toBeVisible();

    await expect(page.locator("button:has-text('Print / Save as PDF')")).toBeVisible();
  });

  test("Export Report's Helicopter View shows the pack's rails before the process index", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/export");
    await page.click('button:has-text("Preview report")');
    await page.waitForURL("**/reports/**");

    await expect(page.getByRole("heading", { name: "Helicopter View" })).toBeVisible();

    // Sits before the process index — and, since this seed has no Value Chain
    // phases, immediately before it too.
    const headings = await page.locator("main h2").allInnerTexts();
    const heliIndex = headings.findIndex((h) => h.includes("Helicopter View"));
    const processIndexIndex = headings.findIndex((h) => h.includes("Processes in This Report"));
    expect(heliIndex).toBeGreaterThanOrEqual(0);
    expect(processIndexIndex).toBeGreaterThan(heliIndex);

    // A real rail per process, and the seeded step link off Purchase-to-Pay's
    // "Send PO to Vendor" renders as a junction bead carrying both processes
    // it hands off to — scoped to this section, since the step's own label
    // and process code both appear again further down in the RACI matrix.
    const helicopterSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Helicopter View" }) });
    await expect(helicopterSection.getByText("PUR101").first()).toBeVisible();
    await expect(helicopterSection.getByText("Send PO to Vendor")).toBeVisible();
    await expect(helicopterSection.getByText("🔗 PUR102")).toBeVisible();
    await expect(helicopterSection.getByText("🔗 SAL101")).toBeVisible();
  });

  test("Process Map is where the report's per-step and process-level documentation is written", async ({ page }) => {
    const mapUrl = "/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/map";
    await page.goto(mapUrl);

    // Process-level documentation (Purpose, Scope, External Entities) lives here.
    await expect(page.getByText("Process Documentation")).toBeVisible();

    // Per-step Detailed Action / Exception Handling are edited in the Steps List view.
    await page.click('button:has-text("Steps List")');
    await page.getByLabel("Edit Create Purchase Order").click();
    await expect(page.getByLabel(/Detailed Action/)).toBeVisible();
    await expect(page.getByLabel(/Exception Handling/)).toBeVisible();
  });

  test("Governance is a workspace page listing every process's control points and KPIs", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/governance");
    await expect(page.locator("h1")).toHaveText("Governance, Controls & Metrics");

    // One section per process, and the seeded co-approval gap surfaces here.
    await expect(page.getByText("Purchase-to-Pay")).toBeVisible();
    await expect(page.getByText("Sales Order Fulfillment")).toBeVisible();
    await expect(page.getByText(/no co-approver is assigned/).first()).toBeVisible();

    // KPIs are editable per process, from here rather than the Process Map.
    await expect(page.getByLabel("Edit KPIs for Purchase-to-Pay")).toBeVisible();
  });

  test("Steps List can reorder steps, and offers where a new step should land", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click('button:has-text("Steps List")');

    const labels = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5 .text-sm.font-semibold");
    const seeded = await labels.allInnerTexts();
    expect(seeded.slice(0, 3)).toEqual(["Start", "Create Purchase Order", "Approve PO?"]);

    // A new step can be placed rather than always landing at the bottom.
    const addForm = page.locator("form").filter({ hasText: "+ Add Step" }).first();
    await expect(addForm.getByLabel("Insert")).toHaveValue("AUTO");

    // Moving is a swap, so moving back restores the seeded order exactly.
    await page.getByLabel("Move Approve PO? up").click();
    await page.click('button:has-text("Steps List")');
    await expect(labels.nth(1)).toHaveText("Approve PO?");
    await expect(labels.nth(2)).toHaveText("Create Purchase Order");

    await page.getByLabel("Move Approve PO? down").click();
    await page.click('button:has-text("Steps List")');
    await expect(labels.nth(1)).toHaveText("Create Purchase Order");
    await expect(await labels.allInnerTexts()).toEqual(seeded);

    // The first step can't move up and the last can't move down.
    await expect(page.getByLabel("Move Start up")).toBeHidden();
    await expect(page.getByLabel("Move End down")).toBeHidden();
  });

  test("Helicopter View draws a rail per process, with milestones and junctions as beads", async ({ page }) => {
    // Milestones are marked from a process's own Steps List.
    const openStepsList = async () => {
      await page.goto("/workspaces/workspace-acme/processes");
      await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
      await page.waitForURL("**/map");
      await page.click('button:has-text("Steps List")');
    };

    await openStepsList();
    await page.getByLabel("Show Pay Vendor on the Helicopter View").click();
    await page.click('button:has-text("Steps List")');
    await expect(page.getByText("★ Milestone")).toBeVisible();

    await page.goto("/workspaces/workspace-acme/helicopter");
    await expect(page.locator("h1")).toHaveText("Helicopter View");
    await expect(page.getByText("1 milestone marked")).toBeVisible();

    // The board, not the written Connections list underneath it, which repeats
    // the same step names in sentences.
    const board = page.locator("main .overflow-x-auto").first();

    // A rail per process, whether or not anything on it earned a bead.
    await expect(board.getByText("Purchase-to-Pay", { exact: true })).toBeVisible();
    await expect(board.getByText("No steps mapped yet").first()).toBeVisible();

    // The marked step is a bead; so is a step that links out to another
    // process, even though nobody marked it — the rails exist to show exactly
    // those junctions.
    await expect(board.getByText("Pay Vendor", { exact: true })).toBeVisible();
    await expect(board.getByText("Send PO to Vendor", { exact: true })).toBeVisible();
    await expect(board.getByText("🔗 PUR102")).toBeVisible();

    // Unmarking puts it back, which also leaves the seeded data as it was.
    // Navigating the way a person does — the sidebar link — so this also covers
    // the marked/unmarked state reaching the view without a hard reload.
    await openStepsList();
    await page.getByLabel("Remove Pay Vendor from the Helicopter View").click();
    await expect(page.getByText("★ Milestone")).toBeHidden();
    await page.getByRole("link", { name: "Helicopter View" }).click();
    await page.waitForURL("**/helicopter");
    await expect(page.getByText("No milestones marked yet")).toBeVisible();
  });

  test("Helicopter View's Cards mode draws every process as a card connected by how work moves", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/helicopter");
    await page.getByRole("button", { name: /Cards/ }).click();
    await expect(page.getByText("4 processes")).toBeVisible();

    // One card per non-archived process, each linking through to its own map.
    const cards = page.locator(".react-flow__node");
    await expect(cards).toHaveCount(4);
    await expect(cards.filter({ hasText: "PUR101" })).toContainText("9 steps");
    await expect(cards.filter({ hasText: "PUR101" })).toContainText("under PUR100");

    // The seeded cross-process step links are drawn, and spelled out in words
    // underneath so the picture isn't the only way to read them.
    const connections = page.locator("main section li");
    await expect(connections).toHaveCount(2);
    await expect(connections.first()).toContainText("PUR101 Purchase-to-Pay links to PUR102 Vendor Onboarding");

    await cards.filter({ hasText: "PUR101" }).getByRole("link").click();
    await page.waitForURL("**/processes/**/map");
  });

  test("Inviting a new member produces a working accept link that provisions an account", async ({ page, context }) => {
    const email = `invite-test-${Date.now()}@example.com`;

    await page.goto("/workspaces/workspace-acme/members");
    const inviteForm = page.locator("form").filter({ has: page.locator('button:has-text("Send invitation")') });
    await inviteForm.locator('input[type="email"]').fill(email);
    await inviteForm.locator("select").selectOption("EDITOR");
    await inviteForm.locator('button:has-text("Send invitation")').click();

    const acceptLink = page.locator("a.font-mono");
    await expect(acceptLink).toBeVisible();
    const acceptUrl = await acceptLink.getAttribute("href");
    expect(acceptUrl).toContain("/invitations/");
    await expect(page.locator("tr", { hasText: email })).toContainText("Invite pending");

    // Accept the invite as a brand-new visitor (separate browser context = logged out).
    const inviteePage = await context.browser()!.newContext().then((c) => c.newPage());
    await inviteePage.goto(acceptUrl!);
    await expect(inviteePage.locator("h1")).toContainText("Join Acme Industrial");
    await inviteePage.fill("#name", "Invite Test User");
    await inviteePage.fill("#password", "test-password-123");
    await inviteePage.click('button:has-text("Create account & join")');
    await inviteePage.waitForURL("**/workspaces/workspace-acme");
    await expect(inviteePage.locator("h1")).toHaveText("Acme Industrial");
    await inviteePage.close();

    // The same accept link must not be reusable once consumed.
    const staleInviteePage = await context.browser()!.newContext().then((c) => c.newPage());
    await staleInviteePage.goto(acceptUrl!);
    await expect(staleInviteePage.locator("h1")).toContainText("Invitation not found");
    await staleInviteePage.close();

    // The invited access level (Editor) must have carried through to the accepted membership.
    await page.reload();
    const row = page.locator("tr", { hasText: email });
    await expect(row).toContainText("Active");
    await expect(row.locator("select")).toHaveValue("EDITOR");

    // Cleanup: remove the invitee so re-runs start clean.
    await row.locator('button:has-text("Remove")').click();
  });
});
