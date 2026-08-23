import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createPerson, updatePersonManager } = await import("@/lib/actions/org");

describe("org chart reporting lines", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("creates a person with a manager set at creation time", async () => {
    const manager = await createPerson({ workspaceId: fixture.workspace.id, name: "Priya Manager", roleIds: [] });
    if (!manager.ok) throw new Error("setup failed");

    const report = await createPerson({
      workspaceId: fixture.workspace.id,
      name: "Sam Report",
      roleIds: [],
      managerId: manager.data.id,
    });
    expect(report.ok).toBe(true);
  });

  it("rejects a manager id from a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherPerson = await createPerson({
      workspaceId: otherFixture.workspace.id,
      name: "Outsider",
      roleIds: [],
    });
    if (!otherPerson.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await createPerson({
      workspaceId: fixture.workspace.id,
      name: "Sam",
      roleIds: [],
      managerId: otherPerson.data.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("updates a manager, and rejects a change that would create a cycle", async () => {
    const alice = await createPerson({ workspaceId: fixture.workspace.id, name: "Alice", roleIds: [] });
    const bob = await createPerson({ workspaceId: fixture.workspace.id, name: "Bob", roleIds: [] });
    if (!alice.ok || !bob.ok) throw new Error("setup failed");

    const setManager = await updatePersonManager({
      workspaceId: fixture.workspace.id,
      personId: bob.data.id,
      managerId: alice.data.id,
    });
    expect(setManager.ok).toBe(true);

    // Bob already reports to Alice — making Alice report to Bob would loop.
    const cyclic = await updatePersonManager({
      workspaceId: fixture.workspace.id,
      personId: alice.data.id,
      managerId: bob.data.id,
    });
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.error).toBe("VALIDATION_ERROR");
  });

  it("clears a manager by passing null", async () => {
    const alice = await createPerson({ workspaceId: fixture.workspace.id, name: "Alice", roleIds: [] });
    const bob = await createPerson({ workspaceId: fixture.workspace.id, name: "Bob", roleIds: [] });
    if (!alice.ok || !bob.ok) throw new Error("setup failed");

    await updatePersonManager({ workspaceId: fixture.workspace.id, personId: bob.data.id, managerId: alice.data.id });
    const cleared = await updatePersonManager({
      workspaceId: fixture.workspace.id,
      personId: bob.data.id,
      managerId: null,
    });
    expect(cleared.ok).toBe(true);
  });

  it("rejects a VIEWER attempting to change a reporting line", async () => {
    const alice = await createPerson({ workspaceId: fixture.workspace.id, name: "Alice", roleIds: [] });
    const bob = await createPerson({ workspaceId: fixture.workspace.id, name: "Bob", roleIds: [] });
    if (!alice.ok || !bob.ok) throw new Error("setup failed");

    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await updatePersonManager({
      workspaceId: fixture.workspace.id,
      personId: bob.data.id,
      managerId: alice.data.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});
