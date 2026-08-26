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

    // Diagram view (default): React Flow renders one node per step plus one per swimlane.
    const laneNodes = page.locator(".react-flow__node").filter({ hasText: /^(AP Clerk|Finance Manager|Procurement Lead)$/i });
    await expect(laneNodes).toHaveCount(3);
    const stepNodes = page.locator(".react-flow__node").filter({ hasNotText: /^(AP Clerk|Finance Manager|Procurement Lead)$/i });
    await expect(stepNodes).toHaveCount(9);
    await expect(page.locator("text=🔗 PUR102")).toBeVisible();
    await expect(page.locator("text=🔗 SAL101")).toBeVisible();

    // Steps List view: same 9 steps, rendered as boxes instead of a diagram.
    await page.click('button:has-text("Steps List")');
    const steps = page.locator("main .rounded-xl.border.border-slate-200.bg-white.p-3\\.5");
    await expect(steps).toHaveCount(9);
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

  test("Authority Matrix shows seeded thresholds and co-approval, and flags an incomplete row", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/authority");
    await expect(page.locator("h1")).toHaveText("Authority Matrix");

    const createPORow = page.locator("tr", { hasText: "Create Purchase Order" });
    await expect(createPORow).toContainText("$10,000");
    await expect(createPORow).toContainText("AP Clerk");

    const approvePORow = page.locator("tr", { hasText: "Approve Purchase Order" });
    await expect(approvePORow).toContainText("$100,000");
    await expect(approvePORow).toContainText("Finance Manager");
    await expect(approvePORow).toContainText("Controller");

    const revisePORow = page.locator("tr", { hasText: "Revise Purchase Order" });
    await expect(revisePORow).toContainText("3 days");
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
    await expect(page.getByText("Delegated Authority & Limits").first()).toBeVisible();
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

  test("Process Map is where the report's per-step and process-level documentation is written", async ({ page }) => {
    const mapUrl = "/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/map";
    await page.goto(mapUrl);

    // Process-level documentation (Purpose, Scope, External Entities) lives here.
    await expect(page.getByText("Process Documentation")).toBeVisible();
    // Governance/KPIs live here too, not in the report.
    await expect(page.getByText("Governance, Controls & Metrics")).toBeVisible();

    // Per-step Detailed Action / Exception Handling are edited in the Steps List view.
    await page.click('button:has-text("Steps List")');
    await page.getByLabel("Edit Create Purchase Order").click();
    await expect(page.getByLabel(/Detailed Action/)).toBeVisible();
    await expect(page.getByLabel(/Exception Handling/)).toBeVisible();
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
