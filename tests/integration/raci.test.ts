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
const {
  setRaciAssignment,
  finalizeRaciMatrix,
  reopenRaciMatrix,
  setStepRaciCell,
  skipStepRaci,
  unskipStepRaci,
  updateActivity,
  deleteActivity,
  validateRaciMatrixAction,
  pinRaciRole,
} = await import("@/lib/actions/raci");
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

  it("blocks finalization when an unskipped Process Map step has no RACI row yet at all", async () => {
    // Fully assign both existing (freestanding) Activities...
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleAId, code: "RESPONSIBLE" });
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity1Id, roleId: roleBId, code: "ACCOUNTABLE" });
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity2Id, roleId: roleAId, code: "RESPONSIBLE" });
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId: activity2Id, roleId: roleBId, code: "ACCOUNTABLE" });

    // ...but a step on the Process Map has never had RACI touched — no Activity exists for it at all.
    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId,
      step: { type: "TASK", label: "Untouched step", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");

    const blocked = await finalizeRaciMatrix({ workspaceId: fixture.workspace.id, processId });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.error === "VALIDATION_FAILED") {
      expect(blocked.issues.some((i) => i.activityId === step.data.id && i.type === "MISSING_ACCOUNTABLE")).toBe(true);
    }

    // Skipping it removes it from validation entirely.
    const skipped = await skipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId: step.data.id });
    expect(skipped.ok).toBe(true);

    const finalized = await finalizeRaciMatrix({ workspaceId: fixture.workspace.id, processId });
    expect(finalized.ok).toBe(true);
  });
});

describe("Process Map step RACI cell actions", () => {
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

  it("creates an Activity linked to the step on the first cell edit", async () => {
    const result = await setStepRaciCell({
      workspaceId: fixture.workspace.id,
      processId,
      stepId,
      roleId: roleAId,
      code: "RESPONSIBLE",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const activity = await prisma.activity.findUnique({
      where: { id: result.data.activityId },
      include: { raciAssignments: true },
    });
    expect(activity?.relatedStepId).toBe(stepId);
    expect(activity?.name).toBe("Receive goods");
    expect(activity?.raciAssignments).toHaveLength(1);
    expect(activity?.raciAssignments[0]?.code).toBe("RESPONSIBLE");
  });

  it("reuses the same Activity across multiple cell edits on the same step", async () => {
    const first = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleAId, code: "RESPONSIBLE" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleBId, code: "ACCOUNTABLE" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.activityId).toBe(first.data.activityId);
    const activity = await prisma.activity.findUnique({
      where: { id: first.data.activityId },
      include: { raciAssignments: true },
    });
    expect(activity?.raciAssignments).toHaveLength(2);
  });

  it("clears one role's code without touching the others, when set to null", async () => {
    await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleAId, code: "RESPONSIBLE" });
    const created = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleBId, code: "ACCOUNTABLE" });
    if (!created.ok) throw new Error("setup failed");

    const cleared = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleAId, code: null });
    expect(cleared.ok).toBe(true);

    const activity = await prisma.activity.findUnique({
      where: { id: created.data.activityId },
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

    const result = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleAId, code: "RESPONSIBLE" });
    expect(result.ok).toBe(true);

    const step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.raciSkipped).toBe(false);
  });

  it("returns notFound for a step belonging to a different process", async () => {
    const otherProcess = await createProcess({ workspaceId: fixture.workspace.id, name: "Other Process" });
    if (!otherProcess.ok) throw new Error("setup failed");

    const result = await setStepRaciCell({
      workspaceId: fixture.workspace.id,
      processId: otherProcess.data.id,
      stepId,
      roleId: roleAId,
      code: "RESPONSIBLE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("rejects a VIEWER attempting to set a cell or skip a step", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const cellResult = await setStepRaciCell({ workspaceId: fixture.workspace.id, processId, stepId, roleId: roleAId, code: "RESPONSIBLE" });
    expect(cellResult.ok).toBe(false);
    if (!cellResult.ok) expect(cellResult.error).toBe("FORBIDDEN");

    const skipResult = await skipStepRaci({ workspaceId: fixture.workspace.id, processId, stepId });
    expect(skipResult.ok).toBe(false);
    if (!skipResult.ok) expect(skipResult.error).toBe("FORBIDDEN");
  });
});

describe("updateActivity / deleteActivity", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;
  let activityId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Activity Edit Process" });
    if (!process.ok) throw new Error("setup failed");
    processId = process.data.id;

    const activity = await createActivity({ workspaceId: fixture.workspace.id, processId, name: "Match Invoice to PO" });
    if (!activity.ok) throw new Error("setup failed");
    activityId = activity.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("renames an activity", async () => {
    const result = await updateActivity({ workspaceId: fixture.workspace.id, activityId, name: "Match Invoice to Order" });
    expect(result.ok).toBe(true);

    const row = await prisma.activity.findUnique({ where: { id: activityId } });
    expect(row?.name).toBe("Match Invoice to Order");
  });

  it("deletes an activity and its RACI assignments", async () => {
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    if (!role.ok) throw new Error("setup failed");
    await setRaciAssignment({ workspaceId: fixture.workspace.id, activityId, roleId: role.data.id, code: "RESPONSIBLE" });

    const result = await deleteActivity({ workspaceId: fixture.workspace.id, activityId });
    expect(result.ok).toBe(true);

    const row = await prisma.activity.findUnique({ where: { id: activityId } });
    expect(row).toBeNull();
    const assignments = await prisma.raciAssignment.findMany({ where: { activityId } });
    expect(assignments).toHaveLength(0);
  });

  it("reverts a step to a plain unassigned row after its linked activity is deleted", async () => {
    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId,
      step: { type: "TASK", label: "Receive goods", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    if (!role.ok) throw new Error("setup failed");

    const cell = await setStepRaciCell({
      workspaceId: fixture.workspace.id,
      processId,
      stepId: step.data.id,
      roleId: role.data.id,
      code: "RESPONSIBLE",
    });
    if (!cell.ok) throw new Error("setup failed");

    await deleteActivity({ workspaceId: fixture.workspace.id, activityId: cell.data.activityId });

    const remaining = await prisma.activity.findUnique({ where: { id: cell.data.activityId } });
    expect(remaining).toBeNull();
    const stepRow = await prisma.processStep.findUnique({ where: { id: step.data.id } });
    expect(stepRow).not.toBeNull(); // the step itself is untouched
  });

  it("rejects a VIEWER attempting to rename or delete an activity", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const renameResult = await updateActivity({ workspaceId: fixture.workspace.id, activityId, name: "x" });
    expect(renameResult.ok).toBe(false);
    if (!renameResult.ok) expect(renameResult.error).toBe("FORBIDDEN");

    const deleteResult = await deleteActivity({ workspaceId: fixture.workspace.id, activityId });
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) expect(deleteResult.error).toBe("FORBIDDEN");
  });

  it("rejects renaming or deleting an activity that belongs to a different workspace, even with valid EDITOR access on the caller's own workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherProcess = await createProcess({ workspaceId: otherFixture.workspace.id, name: "Outsider Process" });
    if (!otherProcess.ok) throw new Error("setup failed");
    const otherActivity = await createActivity({
      workspaceId: otherFixture.workspace.id,
      processId: otherProcess.data.id,
      name: "Outsider Activity",
    });
    if (!otherActivity.ok) throw new Error("setup failed");

    // Back to the original fixture's admin, but targeting the OTHER workspace's activity.
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const renameResult = await updateActivity({
      workspaceId: fixture.workspace.id,
      activityId: otherActivity.data.id,
      name: "Hijacked",
    });
    expect(renameResult.ok).toBe(false);
    if (!renameResult.ok) expect(renameResult.error).toBe("NOT_FOUND");

    const deleteResult = await deleteActivity({ workspaceId: fixture.workspace.id, activityId: otherActivity.data.id });
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) expect(deleteResult.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });
});

describe("pinRaciRole", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;
  let roleId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Pin Role Process" });
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "HR" });
    if (!process.ok || !role.ok) throw new Error("setup failed");
    processId = process.data.id;
    roleId = role.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("pins a role onto the process's visible RACI columns", async () => {
    const result = await pinRaciRole({ workspaceId: fixture.workspace.id, processId, roleId });
    expect(result.ok).toBe(true);

    const row = await prisma.process.findUnique({ where: { id: processId } });
    expect(row?.raciVisibleRoleIds).toEqual([roleId]);
  });

  it("does not add a duplicate entry when the role is already pinned", async () => {
    await pinRaciRole({ workspaceId: fixture.workspace.id, processId, roleId });
    await pinRaciRole({ workspaceId: fixture.workspace.id, processId, roleId });

    const row = await prisma.process.findUnique({ where: { id: processId } });
    expect(row?.raciVisibleRoleIds).toEqual([roleId]);
  });

  it("rejects a roleId from a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherRole = await createRole({ workspaceId: otherFixture.workspace.id, name: "Outsider Role" });
    if (!otherRole.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await pinRaciRole({ workspaceId: fixture.workspace.id, processId, roleId: otherRole.data.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("rejects a processId from a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherProcess = await createProcess({ workspaceId: otherFixture.workspace.id, name: "Outsider Process" });
    if (!otherProcess.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await pinRaciRole({ workspaceId: fixture.workspace.id, processId: otherProcess.data.id, roleId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("rejects a VIEWER attempting to pin a role", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await pinRaciRole({ workspaceId: fixture.workspace.id, processId, roleId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});

describe("cross-workspace isolation on existing RACI actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let otherFixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let otherProcessId: string;
  let otherActivityId: string;
  let otherStepId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    otherFixture = await createFixtureWorkspace();

    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherProcess = await createProcess({ workspaceId: otherFixture.workspace.id, name: "Outsider Process" });
    if (!otherProcess.ok) throw new Error("setup failed");
    otherProcessId = otherProcess.data.id;

    const otherActivity = await createActivity({
      workspaceId: otherFixture.workspace.id,
      processId: otherProcessId,
      name: "Outsider Activity",
    });
    if (!otherActivity.ok) throw new Error("setup failed");
    otherActivityId = otherActivity.data.id;

    const otherStep = await addProcessStep({
      workspaceId: otherFixture.workspace.id,
      processId: otherProcessId,
      step: { type: "TASK", label: "Outsider step", linkedProcessIds: [] },
    });
    if (!otherStep.ok) throw new Error("setup failed");
    otherStepId = otherStep.data.id;

    // Now act as the FIRST fixture's admin, who has EDITOR access on their own
    // workspace but none at all on otherFixture's workspace.
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
    await otherFixture.cleanup();
  });

  it("setRaciAssignment rejects an activityId from a different workspace", async () => {
    const roleResult = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    if (!roleResult.ok) throw new Error("setup failed");

    const result = await setRaciAssignment({
      workspaceId: fixture.workspace.id,
      activityId: otherActivityId,
      roleId: roleResult.data.id,
      code: "RESPONSIBLE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("setStepRaciCell rejects a processId/stepId pair from a different workspace", async () => {
    const roleResult = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    if (!roleResult.ok) throw new Error("setup failed");

    const result = await setStepRaciCell({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      stepId: otherStepId,
      roleId: roleResult.data.id,
      code: "RESPONSIBLE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("finalizeRaciMatrix, reopenRaciMatrix, and validateRaciMatrixAction reject a processId from a different workspace", async () => {
    const finalizeResult = await finalizeRaciMatrix({ workspaceId: fixture.workspace.id, processId: otherProcessId });
    expect(finalizeResult.ok).toBe(false);
    if (!finalizeResult.ok) expect(finalizeResult.error).toBe("NOT_FOUND");

    const reopenResult = await reopenRaciMatrix({ workspaceId: fixture.workspace.id, processId: otherProcessId });
    expect(reopenResult.ok).toBe(false);
    if (!reopenResult.ok) expect(reopenResult.error).toBe("NOT_FOUND");

    const validateResult = await validateRaciMatrixAction({ workspaceId: fixture.workspace.id, processId: otherProcessId });
    expect(validateResult.ok).toBe(false);
    if (!validateResult.ok) expect(validateResult.error).toBe("NOT_FOUND");
  });
});
