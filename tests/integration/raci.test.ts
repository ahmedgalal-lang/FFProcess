import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createProcess, createActivity, addProcessStep } = await import("@/lib/actions/process");
const { createRole } = await import("@/lib/actions/org");
const { setRaciAssignment, finalizeRaciMatrix, reopenRaciMatrix, assignStepRaci, skipStepRaci, unskipStepRaci } = await import(
  "@/lib/actions/raci"
);
const { prisma } = await import("@/lib/db/client");

describe("RACI Server Actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;
  let roleAId: string;
  let roleBId: string;
  let activity1Id: string;
  let activity2Id: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "RACI Test Process" });
    const roleA = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    const roleB = await createRole({ workspaceId: fixture.workspace.id, name: "Manager" });
    if (!process.ok || !roleA.ok || !roleB.ok) throw new Error("setup failed");
    processId = process.data.id;
    roleAId = roleA.data.id;
    roleBId = roleB.data.id;

    const activity1 = await createActivity({ workspaceId: fixture.workspace.id, processId, name: "Receive goods" });
    const activity2 = await createActivity({ workspaceId: fixture.workspace.id, processId, name: "Approve invoice" });
    if (!activity1.ok || !activity2.ok) throw new Error("setup failed");
    activity1Id = activity1.data.id;
    activity2Id = activity2.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("blocks finalization while an activity is missing an Accountable, then allows it once fixed", async () => {
    // Activity 1: fully assigned. Activity 2: Responsible only — missing Accountable.
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleAId, code: "RESPONSIBLE" });
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleBId, code: "ACCOUNTABLE" });
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity2Id, roleId: roleAId, code: "RESPONSIBLE" });

    const blocked = await finalizeRaciMatrix({ workspaceId: fixture.workspace.id, processId });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.error === "VALIDATION_FAILED") {
      expect(blocked.issues.some((i) => i.activityId === activity2Id && i.type === "MISSING_ACCOUNTABLE")).toBe(true);
    }

    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity2Id, roleId: roleBId, code: "ACCOUNTABLE" });

    const finalized = await finalizeRaciMatrix({ workspaceId: fixture.workspace.id, processId });
    expect(finalized.ok).toBe(true);
    if (finalized.ok) expect(finalized.data.status).toBe("FINAL");

    const reopened = await reopenRaciMatrix({ workspaceId: fixture.workspace.id, processId });
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.data.status).toBe("DRAFT");
  });

  it("clears an assignment when set to null", async () => {
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleAId, code: "CONSULTED" });
    const cleared = await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleAId, code: null });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.data.cleared).toBe(true);
  });

  it("rejects a VIEWER attempting to change an assignment", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleAId, code: "RESPONSIBLE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});

describe("Process Map step → RACI queue actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;
  let stepId: string;
  let roleAId: string;
  let roleBId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Step Queue Process" });
    const roleA = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    const roleB = await createRole({ workspaceId: fixture.workspace.id, name: "Manager" });
    if (!process.ok || !roleA.ok || !roleB.ok) throw new Error("setup failed");
    processId = process.data.id;
    roleAId = roleA.data.id;
    roleBId = roleB.data.id;

    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId,
      step: { type: "TASK", label: "Receive goods", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");
    stepId = step.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("creates an Activity linked to the step and assigns RACI codes", async () => {
    const result = await assignStepRaci({
      workspaceId: fixture.workspace.id,
      processId,
      stepId,
      assignments: [
        { roleId: roleAId, code: "RESPONSIBLE" },
        { roleId: roleBId, code: "ACCOUNTABLE" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const activity = await prisma.activity.findUnique({
      where: { id: result.data.activityId },
      include: { raciAssignments: true },
    });
    expect(activity?.relatedStepId).toBe(stepId);
    expect(activity?.name).toBe("Receive goods");
    expect(activity?.raciAssignments).toHaveLength(2);
  });

  it("reuses the same Activity and replaces assignments on a repeat call", async () => {
    const first = await assignStepRaci({
      workspaceId: fixture.workspace.id,
      processId,
      stepId,
      assignments: [{ roleId: roleAId, code: "RESPONSIBLE" }],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await assignStepRaci({
      workspaceId: fixture.workspace.id,
      processId,
      stepId,
      assignments: [{ roleId: roleBId, code: "ACCOUNTABLE" }],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.activityId).toBe(first.data.activityId);
    const activity = await prisma.activity.findUnique({
      where: { id: first.data.activityId },
      include: { raciAssignments: true },
    });
    expect(activity?.raciAssignments).toHaveLength(1);
    expect(activity?.raciAssignments[0]?.roleId).toBe(roleBId);
  });

  it("marks a step skipped and then reverses it", async () => {
    const skipped = await skipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId });
    expect(skipped.ok).toBe(true);
    let step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.raciSkipped).toBe(true);

    const unskipped = await unskipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId });
    expect(unskipped.ok).toBe(true);
    step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.raciSkipped).toBe(false);
  });

  it("clears raciSkipped when a previously-skipped step is assigned instead", async () => {
    await skipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId });

    const result = await assignStepRaci({
      workspaceId: fixture.workspace.id,
      processId,
      stepId,
      assignments: [{ roleId: roleAId, code: "RESPONSIBLE" }],
    });
    expect(result.ok).toBe(true);

    const step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.raciSkipped).toBe(false);
  });

  it("returns notFound for a step belonging to a different process", async () => {
    const otherProcess = await createProcess({ workspaceId: fixture.workspace.id, name: "Other Process" });
    if (!otherProcess.ok) throw new Error("setup failed");

    const result = await assignStepRaci({
      workspaceId: fixture.workspace.id,
      processId: otherProcess.data.id,
      stepId,
      assignments: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("rejects a VIEWER attempting to assign or skip a step", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const assignResult = await assignStepRaci({ workspaceId: fixture.workspace.id, processId, stepId, assignments: [] });
    expect(assignResult.ok).toBe(false);
    if (!assignResult.ok) expect(assignResult.error).toBe("FORBIDDEN");

    const skipResult = await skipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId });
    expect(skipResult.ok).toBe(false);
    if (!skipResult.ok) expect(skipResult.error).toBe("FORBIDDEN");
  });
});
