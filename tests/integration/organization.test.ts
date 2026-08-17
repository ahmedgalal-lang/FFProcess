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

const { deleteWorkspace } = await import("@/lib/actions/organization");
const { createProcess, addProcessStep } = await import("@/lib/actions/process");

describe("deleteWorkspace", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    await prisma.firmMember.create({
      data: { firmId: fixture.firm.id, userId: fixture.adminUser.id, role: "OWNER" },
    });
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // Regression: a step's cross-process link creates a ProcessStepLink whose
  // targetProcessId FK used to be ON DELETE RESTRICT (Prisma's default for a
  // required relation left without an explicit onDelete). That blocked
  // deleting any Workspace containing such a link — including the seeded
  // demo Workspace — with a raw Postgres foreign-key error surfacing as an
  // unhandled 500 in the UI.
  it("deletes a workspace whose Process Map has a cross-process step link", async () => {
    const processA = await createProcess({ workspaceId: fixture.workspace.id, name: "Process A" });
    const processB = await createProcess({ workspaceId: fixture.workspace.id, name: "Process B" });
    if (!processA.ok || !processB.ok) throw new Error("setup failed");

    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId: processA.data.id,
      step: { type: "TASK", label: "Hand off to Process B", linkedProcessIds: [processB.data.id] },
    });
    expect(step.ok).toBe(true);

    const result = await deleteWorkspace({
      workspaceId: fixture.workspace.id,
      confirmName: fixture.workspace.name,
    });
    expect(result.ok).toBe(true);

    const stillThere = await prisma.workspace.findUnique({ where: { id: fixture.workspace.id } });
    expect(stillThere).toBeNull();
  });

  it("rejects deletion when the confirmation name doesn't match", async () => {
    const result = await deleteWorkspace({ workspaceId: fixture.workspace.id, confirmName: "wrong name" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-Firm-Owner caller", async () => {
    const { user: member } = await fixture.addMember("ADMIN");
    mockAuth.mockResolvedValue({ user: { id: member.id } });

    const result = await deleteWorkspace({
      workspaceId: fixture.workspace.id,
      confirmName: fixture.workspace.name,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});
