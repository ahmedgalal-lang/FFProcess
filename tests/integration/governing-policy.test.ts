import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace, createGovernanceAspect } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { mockAssessment, mockDraft } = vi.hoisted(() => ({ mockAssessment: vi.fn(), mockDraft: vi.fn() }));
vi.mock("@/lib/ai/governance-generator", () => ({
  runGovernanceAssessment: mockAssessment,
  runGoverningPolicyDraft: mockDraft,
}));

const { setGoverningPolicy, createGoverningPolicy, draftGoverningPolicyWithAi } = await import("@/lib/actions/governing-policy");
const { generateGovernanceAssessment, addGovernancePolicy, deleteGovernancePolicy, deleteGovernanceAspect } =
  await import("@/lib/actions/governance");
const { prisma } = await import("@/lib/db/client");

describe("Governing policy per aspect (spec 029)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;
  let boardId: string;
  let riskId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockAssessment.mockReset();
    mockDraft.mockReset();
    boardId = (await createGovernanceAspect(workspaceId, "Board Structure")).id;
    riskId = (await createGovernanceAspect(workspaceId, "Risk & Internal Controls")).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function libraryPolicy(title: string) {
    const added = await addGovernancePolicy({ workspaceId, title, body: "1. Purpose" });
    if (!added.ok) throw new Error("setup failed");
    return added.data.id;
  }
  const governing = (aspectId: string) =>
    prisma.governancePolicyDraft.findUnique({ where: { governsAspectId: aspectId } });
  const activity = () =>
    prisma.governanceActivityLogEntry.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

  describe("designating (US1)", () => {
    it("sets, replaces and removes an aspect's governing policy, keeping every policy in the library", async () => {
      const charter = await libraryPolicy("Board Charter");
      const terms = await libraryPolicy("Board Terms of Reference");

      expect((await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: charter })).ok).toBe(true);
      expect((await governing(boardId))?.id).toBe(charter);

      await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: terms });
      expect((await governing(boardId))?.id).toBe(terms);
      expect((await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: charter } })).governsAspectId).toBeNull();

      await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: null });
      expect(await governing(boardId)).toBeNull();
      expect(await prisma.governancePolicyDraft.count({ where: { workspaceId } })).toBe(2);

      const summaries = (await activity()).map((e) => [e.entityLabel, e.summary]).slice(2);
      expect(summaries).toEqual([
        ["Board Charter", "Set as governing policy for Board Structure"],
        ["Board Charter", "Replaced as governing policy for Board Structure"],
        ["Board Terms of Reference", "Set as governing policy for Board Structure"],
        ["Board Terms of Reference", "Removed as governing policy for Board Structure"],
      ]);
    });

    it("refuses a policy that already governs another aspect, naming it", async () => {
      const charter = await libraryPolicy("Board Charter");
      await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: charter });
      const refused = await setGoverningPolicy({ workspaceId, aspectId: riskId, policyId: charter });
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.error).toBe("VALIDATION_ERROR");
        expect(refused.error === "VALIDATION_ERROR" && refused.message).toContain("Board Structure");
      }
      expect(await governing(riskId)).toBeNull();
    });

    it("keeps the policy when its aspect is deleted, and frees the aspect when the policy is deleted", async () => {
      const charter = await libraryPolicy("Board Charter");
      await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: charter });
      await deleteGovernanceAspect({ workspaceId, aspectId: boardId });
      const kept = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: charter } });
      expect(kept.governsAspectId).toBeNull();

      const rmp = await libraryPolicy("Risk Management Policy");
      await setGoverningPolicy({ workspaceId, aspectId: riskId, policyId: rmp });
      await deleteGovernancePolicy({ workspaceId, policyId: rmp });
      expect(await governing(riskId)).toBeNull();
      expect(await prisma.governanceAspect.findUnique({ where: { id: riskId } })).not.toBeNull();
    });

    it("refuses another workspace's aspect or policy, and a VIEWER", async () => {
      const other = await createFixtureWorkspace();
      const theirAspect = await createGovernanceAspect(other.workspace.id, "Board Structure");
      const theirPolicy = await prisma.governancePolicyDraft.create({ data: { workspaceId: other.workspace.id, title: "x", body: "x" } });
      const ours = await libraryPolicy("Board Charter");
      for (const result of [
        await setGoverningPolicy({ workspaceId, aspectId: theirAspect.id, policyId: ours }),
        await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: theirPolicy.id }),
        await createGoverningPolicy({ workspaceId, aspectId: theirAspect.id, templateId: "board-charter" }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();

      const { user: viewer } = await fixture.addMember("VIEWER");
      mockAuth.mockResolvedValue({ user: { id: viewer.id } });
      for (const result of [
        await setGoverningPolicy({ workspaceId, aspectId: boardId, policyId: ours }),
        await createGoverningPolicy({ workspaceId, aspectId: boardId, templateId: "board-charter" }),
        await draftGoverningPolicyWithAi({ workspaceId, aspectId: boardId }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("FORBIDDEN");
      }
    });
  });

  describe("creating (US2)", () => {
    it("starts one from a template, with the workspace's name filled in, as a Draft with version 1", async () => {
      const created = await createGoverningPolicy({ workspaceId, aspectId: boardId, templateId: "board-charter" });
      if (!created.ok) throw new Error("create failed");
      const policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: created.data.id }, include: { versions: true } });
      expect(policy).toMatchObject({ title: "Board Charter", governsAspectId: boardId, lifecycleStatus: "DRAFT", handManaged: true });
      expect(policy.body).toContain(fixture.workspace.name);
      expect(policy.body).not.toContain("{{company}}");
      expect(policy.versions).toHaveLength(1);
      expect((await activity()).at(-1)?.summary).toBe("Added as governing policy for Board Structure (from template)");
    });

    it("writes one by hand, and refuses a second while the aspect has one", async () => {
      const created = await createGoverningPolicy({ workspaceId, aspectId: riskId, title: "Risk Policy", body: "1. Purpose" });
      expect(created.ok).toBe(true);
      const again = await createGoverningPolicy({ workspaceId, aspectId: riskId, templateId: "risk-management" });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.error).toBe("VALIDATION_ERROR");
      const unknown = await createGoverningPolicy({ workspaceId, aspectId: boardId, templateId: "no-such-template" });
      expect(unknown.ok).toBe(false);
    });

    it("drafts one with AI once the profile is set, and reports AI being unavailable", async () => {
      const gated = await draftGoverningPolicyWithAi({ workspaceId, aspectId: boardId });
      expect(gated.ok).toBe(false);
      if (!gated.ok) expect(gated.error).toBe("VALIDATION_ERROR");
      expect(mockDraft).not.toHaveBeenCalled();

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { industry: "Manufacturing", governanceCompanySize: "Mid-market", governanceJurisdiction: "EU" },
      });
      mockDraft.mockResolvedValueOnce({ ok: false, reason: "NOT_CONFIGURED", message: "not configured" });
      const unavailable = await draftGoverningPolicyWithAi({ workspaceId, aspectId: boardId });
      expect(unavailable.ok).toBe(false);
      if (!unavailable.ok) expect(unavailable.error).toBe("AI_UNAVAILABLE");

      mockDraft.mockResolvedValueOnce({ ok: true, data: { title: "Acme Board Charter", body: "1. Purpose\n..." } });
      const drafted = await draftGoverningPolicyWithAi({ workspaceId, aspectId: boardId });
      expect(drafted.ok).toBe(true);
      expect((await governing(boardId))?.title).toBe("Acme Board Charter");
      expect(mockDraft.mock.calls[0]![0]).toContain("Board Structure");
    });

    it("has the assessment draft one only when the aspect has none", async () => {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { industry: "Manufacturing", governanceCompanySize: "Mid-market", governanceJurisdiction: "EU" },
      });
      const outcome = (title: string) => ({
        ok: true as const,
        data: { summary: "s", checklist: [], policies: [], risks: [], governingPolicy: { title, body: "1. Purpose" } },
      });

      mockAssessment.mockResolvedValueOnce(outcome("Board Charter (AI)"));
      await generateGovernanceAssessment({ workspaceId, aspectId: boardId });
      expect((await governing(boardId))?.title).toBe("Board Charter (AI)");
      expect((await activity()).at(-1)?.summary).toContain("governing policy drafted");

      mockAssessment.mockResolvedValueOnce(outcome("Another Charter"));
      await generateGovernanceAssessment({ workspaceId, aspectId: boardId });
      expect((await governing(boardId))?.title).toBe("Board Charter (AI)");
      expect(await prisma.governancePolicyDraft.count({ where: { workspaceId } })).toBe(1);
      expect(mockAssessment.mock.calls[1]![0]).toContain('already has a governing policy ("Board Charter (AI)")');
    });
  });
});
