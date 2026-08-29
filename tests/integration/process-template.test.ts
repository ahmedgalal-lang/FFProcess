import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { generateProcessTemplateDraft, createProcessFromTemplate } = await import("@/lib/actions/process-template");
const { createRole } = await import("@/lib/actions/org");

describe("generateProcessTemplateDraft", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // GEMINI_API_KEY is never set in the test environment — same no-op path
  // exercised by the AI Review feature's own tests.
  it("returns AI_UNAVAILABLE instead of calling the API when GEMINI_API_KEY isn't configured", async () => {
    const result = await generateProcessTemplateDraft({
      workspaceId: fixture.workspace.id,
      processName: "Employee Onboarding",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("AI_UNAVAILABLE");
  });

  it("rejects a VIEWER attempting to draft a template", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await generateProcessTemplateDraft({
      workspaceId: fixture.workspace.id,
      processName: "Employee Onboarding",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});

describe("createProcessFromTemplate", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("materializes a draft into a real process, resolving roles by name", async () => {
    // "AP Clerk" already exists — the draft should reuse it, not duplicate it.
    const existingRole = await createRole({ workspaceId: fixture.workspace.id, name: "AP Clerk" });
    if (!existingRole.ok) throw new Error("setup failed");

    const result = await createProcessFromTemplate({
      workspaceId: fixture.workspace.id,
      processName: "Purchase to Pay",
      steps: [
        { type: "START", label: "Requisition raised", roleName: "AP Clerk" },
        { type: "DECISION", label: "Approve PO?", roleName: "Finance Manager" },
        { type: "END", label: "PO issued", roleName: "" },
      ],
      activities: [
        {
          name: "Approve purchase order",
          assignments: [
            { roleName: "Finance Manager", code: "ACCOUNTABLE" },
            { roleName: "AP Clerk", code: "RESPONSIBLE" },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const process = await prisma.process.findUnique({ where: { id: result.data.id } });
    expect(process?.name).toBe("Purchase to Pay");
    expect(process?.code).toBe(result.data.code);

    const steps = await prisma.processStep.findMany({
      where: { processId: result.data.id },
      orderBy: { createdAt: "asc" },
    });
    expect(steps.map((s) => s.label)).toEqual(["Requisition raised", "Approve PO?", "PO issued"]);
    expect(steps[0]!.assignedRoleId).toBe(existingRole.data.id); // reused, not duplicated

    const connections = await prisma.stepConnection.findMany({ where: { processId: result.data.id } });
    expect(connections).toHaveLength(2); // three steps, chained pairwise

    const roles = await prisma.role.findMany({ where: { workspaceId: fixture.workspace.id } });
    expect(roles.map((r) => r.name).sort()).toEqual(["AP Clerk", "Finance Manager"]);

    const activities = await prisma.activity.findMany({
      where: { processId: result.data.id },
      include: { raciAssignments: true },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]!.raciAssignments).toHaveLength(2);
  });

  it("rejects a VIEWER attempting to create from a template", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await createProcessFromTemplate({
      workspaceId: fixture.workspace.id,
      processName: "Purchase to Pay",
      steps: [{ type: "START", label: "Start", roleName: "" }],
      activities: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});
