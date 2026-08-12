import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createRole } = await import("@/lib/actions/org");
const { createDecisionType, createApprovalRule, deleteApprovalRule, queryApprovers, validateAuthorityMatrix } =
  await import("@/lib/actions/authority");

describe("Authority Server Actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let decisionTypeId: string;
  let clerkRoleId: string;
  let managerRoleId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const clerkRole = await createRole({ workspaceId: fixture.workspace.id, name: "AP Clerk" });
    const managerRole = await createRole({ workspaceId: fixture.workspace.id, name: "Finance Manager" });
    if (!clerkRole.ok || !managerRole.ok) throw new Error("setup failed");
    clerkRoleId = clerkRole.data.id;
    managerRoleId = managerRole.data.id;

    const decisionType = await createDecisionType({ workspaceId: fixture.workspace.id, name: "Purchase Order" });
    if (!decisionType.ok) throw new Error("setup failed");
    decisionTypeId = decisionType.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("resolves the tightest applicable rule and triggers co-approval above its threshold", async () => {
    await createApprovalRule({
      workspaceId: fixture.workspace.id,
      decisionTypeId,
      approverRoleId: clerkRoleId,
      maxThreshold: 5000,
    });
    await createApprovalRule({
      workspaceId: fixture.workspace.id,
      decisionTypeId,
      approverRoleId: managerRoleId,
      maxThreshold: 50000,
      coApprovalAboveThreshold: 20000,
      coApprovalRoleId: clerkRoleId,
    });

    const smallValue = await queryApprovers({ workspaceId: fixture.workspace.id, decisionTypeId, value: 1000 });
    expect(smallValue.ok).toBe(true);
    if (smallValue.ok && !smallValue.data.gap) expect(smallValue.data.approverLabel).toBe("AP Clerk");

    const coApprovalValue = await queryApprovers({ workspaceId: fixture.workspace.id, decisionTypeId, value: 30000 });
    expect(coApprovalValue.ok).toBe(true);
    if (coApprovalValue.ok && !coApprovalValue.data.gap) {
      expect(coApprovalValue.data.approverLabel).toBe("Finance Manager");
      expect(coApprovalValue.data.coApproverLabel).toBe("AP Clerk");
    }

    const gapValue = await queryApprovers({ workspaceId: fixture.workspace.id, decisionTypeId, value: 999999 });
    expect(gapValue.ok).toBe(true);
    if (gapValue.ok) expect(gapValue.data.gap).toBe(true);
  });

  it("flags two rules sharing the same threshold as a conflict", async () => {
    const ruleA = await createApprovalRule({
      workspaceId: fixture.workspace.id,
      decisionTypeId,
      approverRoleId: clerkRoleId,
      maxThreshold: 10000,
    });
    const ruleB = await createApprovalRule({
      workspaceId: fixture.workspace.id,
      decisionTypeId,
      approverRoleId: managerRoleId,
      maxThreshold: 10000,
    });
    expect(ruleA.ok && ruleB.ok).toBe(true);

    const validation = await validateAuthorityMatrix({ workspaceId: fixture.workspace.id, decisionTypeId });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.data.issues).toHaveLength(1);
      expect(validation.data.issues[0]?.type).toBe("CONFLICT");
    }

    if (ruleA.ok) {
      const deleted = await deleteApprovalRule({ workspaceId: fixture.workspace.id, ruleId: ruleA.data.id });
      expect(deleted.ok).toBe(true);
    }
    const revalidated = await validateAuthorityMatrix({ workspaceId: fixture.workspace.id, decisionTypeId });
    if (revalidated.ok) expect(revalidated.data.issues).toHaveLength(0);
  });

  it("rejects a rule with both an approverRoleId and approverPersonId set", async () => {
    const result = await createApprovalRule({
      workspaceId: fixture.workspace.id,
      decisionTypeId,
      approverRoleId: clerkRoleId,
      approverPersonId: "some-person-id",
      maxThreshold: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
  });

  it("rejects an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await queryApprovers({ workspaceId: fixture.workspace.id, decisionTypeId, value: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNAUTHORIZED");
  });
});
