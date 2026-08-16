import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createProcess, addProcessStep, createStepConnection, deleteStepConnection, updateStepPosition } =
  await import("@/lib/actions/process");

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
