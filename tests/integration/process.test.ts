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

const {
  createProcess,
  cloneProcess,
  updateProcess,
  archiveProcess,
  addProcessStep,
  addProcessStepsBulk,
  createActivity,
  createStepConnection,
  deleteStepConnection,
  updateStepPosition,
  updateProcessStep,
  deleteProcessStep,
} = await import("@/lib/actions/process");
const { createRole } = await import("@/lib/actions/org");
const { setRaciAssignment } = await import("@/lib/actions/raci");
const { createProcessCategory } = await import("@/lib/actions/process-category");

describe("process Server Actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("auto-generates sequential Process Codes with no code accepted from the caller", async () => {
    const first = await createProcess({ workspaceId: fixture.workspace.id, name: "Purchase to Pay" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("setup failed");
    expect(first.data.code).toBe("PUR100");

    // A second process sharing the same first word gets the next number, not a collision.
    const second = await createProcess({ workspaceId: fixture.workspace.id, name: "Purchase Requisitions" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.code).toBe("PUR101");

    // A sub-process inherits its parent's prefix instead of deriving one from its own name.
    const child = await createProcess({
      workspaceId: fixture.workspace.id,
      name: "Vendor Onboarding",
      parentProcessId: first.data.id,
    });
    expect(child.ok).toBe(true);
    if (child.ok) expect(child.data.code).toBe("PUR102");
  });

  it("adds a step, connects it, then rejects a connection across two different processes", async () => {
    const processA = await createProcess({ workspaceId: fixture.workspace.id, name: "Process A" });
    const processB = await createProcess({ workspaceId: fixture.workspace.id, name: "Process B" });
    if (!processA.ok || !processB.ok) throw new Error("setup failed");

    const step1 = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: processA.data.id,
      step: { type: "START", label: "Start", linkedProcessIds: [] },
    });
    const step2 = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: processA.data.id,
      step: { type: "TASK", label: "Do the thing", linkedProcessIds: [] },
      fromStepId: step1.ok ? step1.data.id : undefined,
    });
    const stepInOtherProcess = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: processB.data.id,
      step: { type: "START", label: "Other start", linkedProcessIds: [] },
    });
    if (!step1.ok || !step2.ok || !stepInOtherProcess.ok) throw new Error("setup failed");

    // A same-process connection created via drag-to-connect must succeed.
    const goodConnection = await createStepConnection({
      workspaceId: fixture.workspace.id,
      processId: processA.data.id,
      fromStepId: step2.data.id,
      toStepId: step1.data.id,
    });
    expect(goodConnection.ok).toBe(true);

    // A connection spanning two different Processes must be rejected (process-graph rule).
    const crossProcessConnection = await createStepConnection({
      workspaceId: fixture.workspace.id,
      processId: processA.data.id,
      fromStepId: step1.data.id,
      toStepId: stepInOtherProcess.data.id,
    });
    expect(crossProcessConnection.ok).toBe(false);

    if (goodConnection.ok) {
      const deleted = await deleteStepConnection({
        workspaceId: fixture.workspace.id,
        processId: processA.data.id,
        connectionId: goodConnection.data.id,
      });
      expect(deleted.ok).toBe(true);
    }
  });

  it("persists a drag-to-reposition", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Process C" });
    if (!process.ok) throw new Error("setup failed");
    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      step: { type: "START", label: "Start", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");

    const moved = await updateStepPosition({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      stepId: step.data.id,
      positionX: 500,
      positionY: 250,
    });
    expect(moved.ok).toBe(true);
  });

  it("edits an existing step's name, type, and assigned role", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Process F" });
    if (!process.ok) throw new Error("setup failed");
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Reviewer" });
    if (!role.ok) throw new Error("setup failed");
    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      step: { type: "TASK", label: "Draft label", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");

    const updated = await updateProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      stepId: step.data.id,
      type: "DECISION",
      label: "Corrected label",
      assignedRoleId: role.data.id,
      swimlaneRoleId: role.data.id,
    });
    expect(updated.ok).toBe(true);
  });

  it("deletes a step along with its connections, without erroring", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Process G" });
    if (!process.ok) throw new Error("setup failed");

    const start = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      step: { type: "START", label: "Start", linkedProcessIds: [] },
    });
    if (!start.ok) throw new Error("setup failed");
    const task = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      step: { type: "TASK", label: "Mistake", linkedProcessIds: [] },
      fromStepId: start.data.id,
    });
    if (!task.ok) throw new Error("setup failed");

    const deleted = await deleteProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      stepId: task.data.id,
    });
    expect(deleted.ok).toBe(true);

    // Its incoming connection is gone too (cascaded), not left dangling.
    const reconnect = await createStepConnection({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      fromStepId: start.data.id,
      toStepId: task.data.id,
    });
    expect(reconnect.ok).toBe(false); // task no longer exists
  });

  it("assigns a process to a category, and get-or-creates a category by name", async () => {
    const first = await createProcessCategory({ workspaceId: fixture.workspace.id, name: "HR" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("setup failed");

    // Creating "HR" again returns the same category instead of erroring or duplicating.
    const second = await createProcessCategory({ workspaceId: fixture.workspace.id, name: "HR" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.id).toBe(first.data.id);

    const process = await createProcess({
      workspaceId: fixture.workspace.id,
      name: "Hire to Retire",
      categoryId: first.data.id,
    });
    expect(process.ok).toBe(true);
  });

  it("rejects a category id from a different Firm", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherCategory = await createProcessCategory({ workspaceId: otherFixture.workspace.id, name: "Sales" });
    if (!otherCategory.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await createProcess({
      workspaceId: fixture.workspace.id,
      name: "Cross-firm category attempt",
      categoryId: otherCategory.data.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("bulk-adds a chain of Task steps from a pasted list", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Process H" });
    if (!process.ok) throw new Error("setup failed");

    const result = await addProcessStepsBulk({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      labels: ["Receive requisition", "Check budget", "Approve or reject"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ids).toHaveLength(3);

    const steps = await prisma.processStep.findMany({ where: { id: { in: result.data.ids } } });
    expect(steps.every((s) => s.type === "TASK")).toBe(true);
    expect(steps.map((s) => s.label).sort()).toEqual(
      ["Receive requisition", "Check budget", "Approve or reject"].sort()
    );

    const connections = await prisma.stepConnection.findMany({ where: { processId: process.data.id } });
    expect(connections).toHaveLength(2); // three steps, chained pairwise
    const [a, b, c] = result.data.ids;
    expect(connections).toContainEqual(expect.objectContaining({ fromStepId: a, toStepId: b }));
    expect(connections).toContainEqual(expect.objectContaining({ fromStepId: b, toStepId: c }));
  });

  it("chains a bulk-add onto whatever step was already last in the map", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Process I" });
    if (!process.ok) throw new Error("setup failed");
    const existing = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      step: { type: "START", label: "Start", linkedProcessIds: [] },
    });
    if (!existing.ok) throw new Error("setup failed");

    const bulk = await addProcessStepsBulk({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      labels: ["First bulk step"],
    });
    expect(bulk.ok).toBe(true);
    if (!bulk.ok) return;

    const connections = await prisma.stepConnection.findMany({ where: { processId: process.data.id } });
    expect(connections).toContainEqual(
      expect.objectContaining({ fromStepId: existing.data.id, toStepId: bulk.data.ids[0] })
    );
  });

  it("clones a process's steps, connections, links, and RACI assignments", async () => {
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Approver" });
    if (!role.ok) throw new Error("setup failed");

    const source = await createProcess({ workspaceId: fixture.workspace.id, name: "Process J" });
    const otherProcess = await createProcess({ workspaceId: fixture.workspace.id, name: "Process K" });
    if (!source.ok || !otherProcess.ok) throw new Error("setup failed");

    const start = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: source.data.id,
      step: { type: "START", label: "Start", assignedRoleId: role.data.id, linkedProcessIds: [] },
    });
    if (!start.ok) throw new Error("setup failed");
    const task = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: source.data.id,
      step: { type: "TASK", label: "Do the thing", linkedProcessIds: [otherProcess.data.id] },
      fromStepId: start.data.id,
      connectionLabel: "Go",
    });
    if (!task.ok) throw new Error("setup failed");

    const activity = await createActivity({
      workspaceId: fixture.workspace.id,
      processId: source.data.id,
      name: "Review the thing",
      relatedStepId: task.data.id,
    });
    if (!activity.ok) throw new Error("setup failed");
    await setRaciAssignment({
      workspaceId: fixture.workspace.id,
      activityId: activity.data.id,
      roleId: role.data.id,
      code: "ACCOUNTABLE",
    });

    const clone = await cloneProcess({
      workspaceId: fixture.workspace.id,
      sourceProcessId: source.data.id,
      name: "Process J (Copy)",
    });
    expect(clone.ok).toBe(true);
    if (!clone.ok) return;
    expect(clone.data.code).not.toBe(source.data.code); // fresh auto-generated code

    const clonedSteps = await prisma.processStep.findMany({
      where: { processId: clone.data.id },
      orderBy: { createdAt: "asc" },
    });
    expect(clonedSteps).toHaveLength(2);
    expect(clonedSteps.map((s) => s.label)).toEqual(["Start", "Do the thing"]);
    expect(clonedSteps[1]!.assignedRoleId).toBeNull();
    expect(clonedSteps[0]!.assignedRoleId).toBe(role.data.id); // same-workspace Role carries over

    const clonedConnections = await prisma.stepConnection.findMany({ where: { processId: clone.data.id } });
    expect(clonedConnections).toHaveLength(1);
    expect(clonedConnections[0]!.label).toBe("Go");
    // The connection references the CLONED steps, not the originals.
    expect(clonedConnections[0]!.fromStepId).toBe(clonedSteps[0]!.id);
    expect(clonedConnections[0]!.toStepId).toBe(clonedSteps[1]!.id);

    const clonedLinks = await prisma.processStepLink.findMany({ where: { stepId: clonedSteps[1]!.id } });
    expect(clonedLinks).toHaveLength(1);
    expect(clonedLinks[0]!.targetProcessId).toBe(otherProcess.data.id);

    const clonedActivities = await prisma.activity.findMany({
      where: { processId: clone.data.id },
      include: { raciAssignments: true },
    });
    expect(clonedActivities).toHaveLength(1);
    expect(clonedActivities[0]!.relatedStepId).toBe(clonedSteps[1]!.id);
    expect(clonedActivities[0]!.raciAssignments).toEqual([
      expect.objectContaining({ roleId: role.data.id, code: "ACCOUNTABLE" }),
    ]);

    // Original process is untouched.
    const originalSteps = await prisma.processStep.count({ where: { processId: source.data.id } });
    expect(originalSteps).toBe(2);
  });

  it("rejects cloning a process from a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherProcess = await createProcess({ workspaceId: otherFixture.workspace.id, name: "Foreign process" });
    if (!otherProcess.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await cloneProcess({
      workspaceId: fixture.workspace.id,
      sourceProcessId: otherProcess.data.id,
      name: "Attempted cross-workspace clone",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("rejects EDITOR-level actions from a caller with only VIEWER access", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await createProcess({ workspaceId: fixture.workspace.id, name: "Process D" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });

  it("rejects any action from an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await createProcess({ workspaceId: fixture.workspace.id, name: "Process E" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNAUTHORIZED");
  });
});

describe("updateProcess / archiveProcess", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("edits a process's name, description, and category", async () => {
    const category = await createProcessCategory({ workspaceId: fixture.workspace.id, name: "Finance" });
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Draft Name" });
    if (!category.ok || !process.ok) throw new Error("setup failed");

    const result = await updateProcess({
      workspaceId: fixture.workspace.id,
      processId: process.data.id,
      name: "Corrected Name",
      description: "Updated description",
      categoryId: category.data.id,
    });
    expect(result.ok).toBe(true);

    const row = await prisma.process.findUnique({ where: { id: process.data.id } });
    expect(row?.name).toBe("Corrected Name");
    expect(row?.description).toBe("Updated description");
    expect(row?.categoryId).toBe(category.data.id);
  });

  it("rejects a parent selection that would create a circular hierarchy", async () => {
    const parent = await createProcess({ workspaceId: fixture.workspace.id, name: "Parent" });
    if (!parent.ok) throw new Error("setup failed");
    const child = await createProcess({
      workspaceId: fixture.workspace.id,
      name: "Child",
      parentProcessId: parent.data.id,
    });
    if (!child.ok) throw new Error("setup failed");

    const cyclic = await updateProcess({
      workspaceId: fixture.workspace.id,
      processId: parent.data.id,
      parentProcessId: child.data.id,
    });
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.error).toBe("VALIDATION_ERROR");
  });

  it("archives a process, dropping it out of the active list", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "To Archive" });
    if (!process.ok) throw new Error("setup failed");

    const result = await archiveProcess({ workspaceId: fixture.workspace.id, processId: process.data.id });
    expect(result.ok).toBe(true);

    const row = await prisma.process.findUnique({ where: { id: process.data.id } });
    expect(row?.archivedAt).not.toBeNull();

    const activeList = await prisma.process.findMany({ where: { workspaceId: fixture.workspace.id, archivedAt: null } });
    expect(activeList.some((p) => p.id === process.data.id)).toBe(false);
  });

  it("rejects a VIEWER attempting to edit or archive a process", async () => {
    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Guarded" });
    if (!process.ok) throw new Error("setup failed");

    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const updateResult = await updateProcess({ workspaceId: fixture.workspace.id, processId: process.data.id, name: "x" });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("FORBIDDEN");

    const archiveResult = await archiveProcess({ workspaceId: fixture.workspace.id, processId: process.data.id });
    expect(archiveResult.ok).toBe(false);
    if (!archiveResult.ok) expect(archiveResult.error).toBe("FORBIDDEN");
  });
});

describe("cross-workspace isolation on process actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let otherFixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let otherProcessId: string;
  let otherStepId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    otherFixture = await createFixtureWorkspace();

    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherProcess = await createProcess({ workspaceId: otherFixture.workspace.id, name: "Outsider Process" });
    if (!otherProcess.ok) throw new Error("setup failed");
    otherProcessId = otherProcess.data.id;

    const otherStep = await addProcessStep({
      workspaceId: otherFixture.workspace.id,
      processId: otherProcessId,
      step: { type: "START", label: "Outsider start", linkedProcessIds: [] },
    });
    if (!otherStep.ok) throw new Error("setup failed");
    otherStepId = otherStep.data.id;

    // Now act as the FIRST fixture's admin — EDITOR on their own workspace,
    // no access at all to otherFixture's workspace.
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
    await otherFixture.cleanup();
  });

  it("updateProcess and archiveProcess reject a processId from a different workspace", async () => {
    const updateResult = await updateProcess({ workspaceId: fixture.workspace.id, processId: otherProcessId, name: "Hijacked" });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("NOT_FOUND");

    const archiveResult = await archiveProcess({ workspaceId: fixture.workspace.id, processId: otherProcessId });
    expect(archiveResult.ok).toBe(false);
    if (!archiveResult.ok) expect(archiveResult.error).toBe("NOT_FOUND");
  });

  it("addProcessStep, addProcessStepsBulk, and createActivity reject a processId from a different workspace", async () => {
    const addResult = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      step: { type: "TASK", label: "Hijacked step", linkedProcessIds: [] },
    });
    expect(addResult.ok).toBe(false);
    if (!addResult.ok) expect(addResult.error).toBe("NOT_FOUND");

    const bulkResult = await addProcessStepsBulk({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      labels: ["Hijacked step"],
    });
    expect(bulkResult.ok).toBe(false);
    if (!bulkResult.ok) expect(bulkResult.error).toBe("NOT_FOUND");

    const activityResult = await createActivity({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      name: "Hijacked activity",
    });
    expect(activityResult.ok).toBe(false);
    if (!activityResult.ok) expect(activityResult.error).toBe("NOT_FOUND");
  });

  it("updateProcessStep, deleteProcessStep, and updateStepPosition reject a processId/stepId pair from a different workspace", async () => {
    const updateResult = await updateProcessStep({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      stepId: otherStepId,
      type: "TASK",
      label: "Hijacked",
    });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("NOT_FOUND");

    const positionResult = await updateStepPosition({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      stepId: otherStepId,
      positionX: 1,
      positionY: 1,
    });
    expect(positionResult.ok).toBe(false);
    if (!positionResult.ok) expect(positionResult.error).toBe("NOT_FOUND");

    const deleteResult = await deleteProcessStep({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      stepId: otherStepId,
    });
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) expect(deleteResult.error).toBe("NOT_FOUND");
  });

  it("createStepConnection and deleteStepConnection reject a processId from a different workspace", async () => {
    const connectResult = await createStepConnection({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      fromStepId: otherStepId,
      toStepId: otherStepId,
    });
    expect(connectResult.ok).toBe(false);
    if (!connectResult.ok) expect(connectResult.error).toBe("NOT_FOUND");

    const deleteConnResult = await deleteStepConnection({
      workspaceId: fixture.workspace.id,
      processId: otherProcessId,
      connectionId: "does-not-matter",
    });
    expect(deleteConnResult.ok).toBe(false);
    if (!deleteConnResult.ok) expect(deleteConnResult.error).toBe("NOT_FOUND");
  });
});
