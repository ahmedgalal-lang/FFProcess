import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { inviteMember, changeMemberAccessLevel, removeMember } = await import("@/lib/actions/membership");

describe("membership Server Actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("invites a new member and rejects re-inviting someone already active", async () => {
    const email = `${fixture.unique("invitee")}@test.local`;
    const invited = await inviteMember({ workspaceId: fixture.workspace.id, email, accessLevel: "EDITOR" });
    expect(invited.ok).toBe(true);
    if (invited.ok) {
      expect(invited.data.acceptUrl).toContain("/invitations/");
      expect(invited.data.emailSent).toBe(false); // no RESEND_API_KEY in this environment
    }

    const duplicate = await inviteMember({ workspaceId: fixture.workspace.id, email, accessLevel: "VIEWER" });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toBe("VALIDATION_ERROR");
  });

  it("blocks demoting the sole Admin, then allows it once a second Admin exists", async () => {
    const soleAdminDemote = await changeMemberAccessLevel({
      workspaceId: fixture.workspace.id,
      memberId: fixture.adminMember.id,
      accessLevel: "EDITOR",
    });
    expect(soleAdminDemote.ok).toBe(false);
    if (!soleAdminDemote.ok) expect(soleAdminDemote.error).toBe("LAST_ADMIN");

    await fixture.addMember("ADMIN");

    const demoteWithBackup = await changeMemberAccessLevel({
      workspaceId: fixture.workspace.id,
      memberId: fixture.adminMember.id,
      accessLevel: "EDITOR",
    });
    expect(demoteWithBackup.ok).toBe(true);
  });

  it("blocks removing the sole Admin, then allows it once a second Admin exists", async () => {
    const soleAdminRemove = await removeMember({ workspaceId: fixture.workspace.id, memberId: fixture.adminMember.id });
    expect(soleAdminRemove.ok).toBe(false);
    if (!soleAdminRemove.ok) expect(soleAdminRemove.error).toBe("LAST_ADMIN");

    await fixture.addMember("ADMIN");

    const removeWithBackup = await removeMember({ workspaceId: fixture.workspace.id, memberId: fixture.adminMember.id });
    expect(removeWithBackup.ok).toBe(true);
  });

  it("rejects an EDITOR from inviting members (ADMIN-only action)", async () => {
    const { user: editor } = await fixture.addMember("EDITOR");
    mockAuth.mockResolvedValue({ user: { id: editor.id } });

    const result = await inviteMember({
      workspaceId: fixture.workspace.id,
      email: `${fixture.unique("blocked")}@test.local`,
      accessLevel: "VIEWER",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });
});
