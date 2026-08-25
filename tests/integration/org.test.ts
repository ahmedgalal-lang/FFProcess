import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createPerson, updatePersonManager, createRole, updateRole, archiveRole, updatePerson, archivePerson } =
  await import("@/lib/actions/org");

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

describe("editing and archiving Roles and People", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("renames a Role", async () => {
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    if (!role.ok) throw new Error("setup failed");

    const renamed = await updateRole({ workspaceId: fixture.workspace.id, roleId: role.data.id, name: "AP Clerk" });
    expect(renamed.ok).toBe(true);
  });

  it("rejects renaming a Role to a name another active Role already has", async () => {
    const roleA = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    const roleB = await createRole({ workspaceId: fixture.workspace.id, name: "Manager" });
    if (!roleA.ok || !roleB.ok) throw new Error("setup failed");

    const result = await updateRole({ workspaceId: fixture.workspace.id, roleId: roleB.data.id, name: "Clerk" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
  });

  it("rejects updating or archiving a Role that belongs to a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherRole = await createRole({ workspaceId: otherFixture.workspace.id, name: "Outsider Role" });
    if (!otherRole.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const updateResult = await updateRole({ workspaceId: fixture.workspace.id, roleId: otherRole.data.id, name: "Hijacked" });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("NOT_FOUND");

    const archiveResult = await archiveRole({ workspaceId: fixture.workspace.id, roleId: otherRole.data.id });
    expect(archiveResult.ok).toBe(false);
    if (!archiveResult.ok) expect(archiveResult.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("edits a Person's name, email, and role assignments", async () => {
    const roleA = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    const roleB = await createRole({ workspaceId: fixture.workspace.id, name: "Manager" });
    if (!roleA.ok || !roleB.ok) throw new Error("setup failed");

    const person = await createPerson({
      workspaceId: fixture.workspace.id,
      name: "Sam",
      roleIds: [roleA.data.id],
    });
    if (!person.ok) throw new Error("setup failed");

    const updated = await updatePerson({
      workspaceId: fixture.workspace.id,
      personId: person.data.id,
      name: "Samantha",
      email: "samantha@example.com",
      roleIds: [roleB.data.id],
    });
    expect(updated.ok).toBe(true);

    const { prisma } = await import("@/lib/db/client");
    const row = await prisma.person.findUnique({ where: { id: person.data.id }, include: { personRoles: true } });
    expect(row?.name).toBe("Samantha");
    expect(row?.email).toBe("samantha@example.com");
    expect(row?.personRoles.map((pr) => pr.roleId)).toEqual([roleB.data.id]);
  });

  it("rejects updating or archiving a Person that belongs to a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });
    const otherPerson = await createPerson({ workspaceId: otherFixture.workspace.id, name: "Outsider", roleIds: [] });
    if (!otherPerson.ok) throw new Error("setup failed");

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const updateResult = await updatePerson({
      workspaceId: fixture.workspace.id,
      personId: otherPerson.data.id,
      name: "Hijacked",
      email: "",
      roleIds: [],
    });
    expect(updateResult.ok).toBe(false);
    if (!updateResult.ok) expect(updateResult.error).toBe("NOT_FOUND");

    const archiveResult = await archivePerson({ workspaceId: fixture.workspace.id, personId: otherPerson.data.id });
    expect(archiveResult.ok).toBe(false);
    if (!archiveResult.ok) expect(archiveResult.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });

  it("rejects a VIEWER attempting to edit a Role or Person", async () => {
    const role = await createRole({ workspaceId: fixture.workspace.id, name: "Clerk" });
    const person = await createPerson({ workspaceId: fixture.workspace.id, name: "Sam", roleIds: [] });
    if (!role.ok || !person.ok) throw new Error("setup failed");

    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const roleResult = await updateRole({ workspaceId: fixture.workspace.id, roleId: role.data.id, name: "New name" });
    expect(roleResult.ok).toBe(false);
    if (!roleResult.ok) expect(roleResult.error).toBe("FORBIDDEN");

    const personResult = await updatePerson({
      workspaceId: fixture.workspace.id,
      personId: person.data.id,
      name: "New name",
      email: "",
      roleIds: [],
    });
    expect(personResult.ok).toBe(false);
    if (!personResult.ok) expect(personResult.error).toBe("FORBIDDEN");
  });
});
