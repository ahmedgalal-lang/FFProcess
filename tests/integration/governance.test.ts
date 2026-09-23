import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { mockRunGovernanceAssessment } = vi.hoisted(() => ({ mockRunGovernanceAssessment: vi.fn() }));
vi.mock("@/lib/ai/governance-generator", () => ({ runGovernanceAssessment: mockRunGovernanceAssessment }));

const {
  setGovernanceProfile,
  generateGovernanceAssessment,
  setChecklistItemStatus,
  addGovernanceChecklistItem,
  updateGovernanceChecklistItem,
  deleteGovernanceChecklistItem,
  updatePolicyDraft,
  addGovernancePolicy,
  deleteGovernancePolicy,
  addGovernanceRisk,
  updateGovernanceRisk,
} = await import("@/lib/actions/governance");
const { prisma } = await import("@/lib/db/client");

/** A full, well-formed AI outcome — every test starts from a copy of this and edits what it needs. */
function outcome(overrides: Partial<import("@/lib/ai/governance-generator").GovernanceAssessmentResult> = {}) {
  return {
    ok: true as const,
    data: {
      summary: "Acme Manufacturing (mid-market, EU) needs a formal risk committee.",
      checklist: [
        {
          phase: "immediate" as const,
          title: "Establish a risk committee",
          description: "Form a standing committee to own operational risk.",
          policyTitle: "Risk Committee Charter",
          riskTitle: "No dedicated risk oversight",
        },
        {
          phase: "near_term" as const,
          title: "Adopt a whistleblower policy",
          description: "Give staff a confidential channel to report concerns.",
          policyTitle: null,
          riskTitle: null,
        },
      ],
      policies: [{ title: "Risk Committee Charter", body: "1. Purpose\n2. Membership\n3. Duties" }],
      risks: [
        {
          title: "No dedicated risk oversight",
          description: "Nobody owns operational risk end to end.",
          likelihood: "high" as const,
          impact: "high" as const,
        },
      ],
      ...overrides,
    },
  };
}

describe("setGovernanceProfile / generateGovernanceAssessment", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("refuses to generate before the profile (industry/size/jurisdiction) is set, without calling the model", async () => {
    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
    expect(mockRunGovernanceAssessment).not.toHaveBeenCalled();
  });

  it("returns AI_UNAVAILABLE when the model reports it isn't configured", async () => {
    // generateStructured's own graceful no-op when GEMINI_API_KEY is unset —
    // the real, unmocked path — is already proven generically by ai-review's
    // equivalent test (both features go through the same generateStructured).
    // What belongs here is the action's own handling of that outcome.
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue({
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI governance assessment isn't configured for this deployment yet.",
    });

    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("AI_UNAVAILABLE");
  });

  it("persists the summary, a checklist item per phase, its linked policy, and both a linked and an unlinked risk", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(
      outcome({
        risks: [
          {
            title: "No dedicated risk oversight",
            description: "Nobody owns operational risk end to end.",
            likelihood: "high",
            impact: "high",
          },
          {
            title: "Vendor concentration",
            description: "One supplier accounts for most procurement spend.",
            likelihood: "medium",
            impact: "high",
          },
        ],
      })
    );

    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The prompt actually carried the workspace's real profile, not placeholder text.
    const [promptText] = mockRunGovernanceAssessment.mock.calls[0]!;
    expect(promptText).toContain("Manufacturing");
    expect(promptText).toContain("50-200 employees");
    expect(promptText).toContain("EU");

    const assessment = await prisma.governanceAssessment.findUnique({
      where: { id: result.data.assessmentId },
      include: { items: { include: { policy: true } } },
    });
    expect(assessment?.summary).toContain("Acme Manufacturing");
    expect(assessment?.items).toHaveLength(2);

    const committeeItem = assessment!.items.find((i) => i.title === "Establish a risk committee")!;
    expect(committeeItem.phase).toBe("IMMEDIATE");
    expect(committeeItem.policy?.title).toBe("Risk Committee Charter");

    const whistleblowerItem = assessment!.items.find((i) => i.title === "Adopt a whistleblower policy")!;
    expect(whistleblowerItem.phase).toBe("NEAR_TERM");
    expect(whistleblowerItem.policy).toBeNull();

    const risks = await prisma.governanceRisk.findMany({ where: { workspaceId: fixture.workspace.id } });
    expect(risks).toHaveLength(2);
    const linked = risks.find((r) => r.title === "No dedicated risk oversight")!;
    expect(linked.sourceItemId).toBe(committeeItem.id);
    const unlinked = risks.find((r) => r.title === "Vendor concentration")!;
    expect(unlinked.sourceItemId).toBeNull();
  });

  it("does not recreate a DONE or DISMISSED item, and does not duplicate an OPEN one, on regenerate", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());

    const first = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const items = await prisma.governanceChecklistItem.findMany({ where: { assessmentId: first.data.assessmentId } });
    const committee = items.find((i) => i.title === "Establish a risk committee")!;
    const whistleblower = items.find((i) => i.title === "Adopt a whistleblower policy")!;

    const doneResult = await setChecklistItemStatus({
      workspaceId: fixture.workspace.id,
      itemId: committee.id,
      status: "DONE",
    });
    expect(doneResult.ok).toBe(true);
    const dismissedResult = await setChecklistItemStatus({
      workspaceId: fixture.workspace.id,
      itemId: whistleblower.id,
      status: "DISMISSED",
    });
    expect(dismissedResult.ok).toBe(true);

    // A second run returns the exact same titles — as if the model, asked
    // again, reasonably reached the same conclusions.
    const second = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" });
    expect(second.ok).toBe(true);

    const afterItems = await prisma.governanceChecklistItem.findMany({
      where: { assessmentId: first.data.assessmentId },
    });
    expect(afterItems).toHaveLength(2); // neither recreated nor duplicated

    const committeeAfter = afterItems.find((i) => i.id === committee.id)!;
    expect(committeeAfter.status).toBe("DONE");
    const whistleblowerAfter = afterItems.find((i) => i.id === whistleblower.id)!;
    expect(whistleblowerAfter.status).toBe("DISMISSED");
  });

  it("does not overwrite an edited policy body, or a hand-scored risk, on regenerate", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());

    const first = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const policy = await prisma.governancePolicyDraft.findFirstOrThrow({
      where: { checklistItem: { assessmentId: first.data.assessmentId } },
    });
    const editResult = await updatePolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId: policy.id,
      body: "A consultant's own hand-edited charter text.",
    });
    expect(editResult.ok).toBe(true);

    const risk = await prisma.governanceRisk.findFirstOrThrow({ where: { workspaceId: fixture.workspace.id } });
    const rescoreResult = await updateGovernanceRisk({
      workspaceId: fixture.workspace.id,
      riskId: risk.id,
      likelihood: "LOW",
      status: "ACCEPTED",
    });
    expect(rescoreResult.ok).toBe(true);

    // Regenerate: the mock returns the same policy/risk titles again — as if
    // the model, asked again, drafted them the same way.
    await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" });

    const policyAfter = await prisma.governancePolicyDraft.findUnique({ where: { id: policy.id } });
    expect(policyAfter?.body).toBe("A consultant's own hand-edited charter text.");
    expect(policyAfter?.status).toBe("EDITED");

    const riskAfter = await prisma.governanceRisk.findUnique({ where: { id: risk.id } });
    expect(riskAfter?.likelihood).toBe("LOW");
    expect(riskAfter?.status).toBe("ACCEPTED");
    expect(riskAfter?.handManaged).toBe(true);

    // And regeneration did not create a second, duplicate policy or risk for
    // the same title either.
    const allPolicies = await prisma.governancePolicyDraft.count({
      where: { checklistItem: { assessmentId: first.data.assessmentId } },
    });
    expect(allPolicies).toBe(1);
    const allRisks = await prisma.governanceRisk.count({ where: { workspaceId: fixture.workspace.id } });
    expect(allRisks).toBe(1);
  });

  it("a hand-added risk survives a regenerate that returns a different risk with the same title", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });

    const added = await addGovernanceRisk({
      workspaceId: fixture.workspace.id,
      title: "No dedicated risk oversight",
      description: "Flagged by the engagement lead before any assessment ran.",
      likelihood: "MEDIUM",
      impact: "MEDIUM",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" });

    const riskAfter = await prisma.governanceRisk.findUnique({ where: { id: added.data.id } });
    expect(riskAfter?.description).toBe("Flagged by the engagement lead before any assessment ran.");
    expect(riskAfter?.likelihood).toBe("MEDIUM");

    const allRisks = await prisma.governanceRisk.count({ where: { workspaceId: fixture.workspace.id } });
    expect(allRisks).toBe(1); // not duplicated by title
  });
});

describe("Policies written by hand", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("adds a policy with no assessment behind it, and finds it on the workspace", async () => {
    // The gap this closes: the Policy Library could only ever show what an
    // assessment had drafted, so with no assessment run it was empty with no
    // way to put anything in it.
    const result = await addGovernancePolicy({
      workspaceId: fixture.workspace.id,
      title: "Data Retention Policy",
      body: "1. Purpose\n2. Retention periods\n3. Deletion",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(policy.workspaceId).toBe(fixture.workspace.id);
    expect(policy.checklistItemId).toBeNull();
    expect(policy.handManaged).toBe(true);

    // And it is reachable by the workspace-wide read the Policy Library does,
    // which is the query that used to walk assessments instead.
    const onWorkspace = await prisma.governancePolicyDraft.findMany({
      where: { workspaceId: fixture.workspace.id },
    });
    expect(onWorkspace.map((p) => p.title)).toEqual(["Data Retention Policy"]);
  });

  it("edits a hand-written policy's title and body, and deletes it", async () => {
    const added = await addGovernancePolicy({
      workspaceId: fixture.workspace.id,
      title: "Draft name",
      body: "First cut.",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const edited = await updatePolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      title: "Records Management Policy",
      body: "A fuller second cut.",
    });
    expect(edited.ok).toBe(true);

    const afterEdit = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: added.data.id } });
    expect(afterEdit.title).toBe("Records Management Policy");
    expect(afterEdit.body).toBe("A fuller second cut.");

    const removed = await deleteGovernancePolicy({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    expect(removed.ok).toBe(true);
    expect(await prisma.governancePolicyDraft.findUnique({ where: { id: added.data.id } })).toBeNull();
  });

  it("refuses to touch a policy belonging to another workspace", async () => {
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernancePolicy({
      workspaceId: other.workspace.id,
      title: "Theirs",
      body: "Not yours.",
    });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const edit = await updatePolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId: theirs.data.id,
      body: "Rewritten from the wrong workspace.",
    });
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error).toBe("NOT_FOUND");

    const remove = await deleteGovernancePolicy({
      workspaceId: fixture.workspace.id,
      policyId: theirs.data.id,
    });
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error).toBe("NOT_FOUND");

    await other.cleanup();
  });

  it("generates an assessment for a focus area added after the first five", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());

    for (const focusArea of ["DATA_INTEGRITY", "ACCESSIBILITY"] as const) {
      const result = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea });
      expect(result.ok, `${focusArea} should be a valid focus area`).toBe(true);
    }

    const stored = await prisma.governanceAssessment.findMany({ where: { workspaceId: fixture.workspace.id } });
    expect(stored.map((a) => a.focusArea).sort()).toEqual(["ACCESSIBILITY", "DATA_INTEGRITY"]);
  });
});

describe("Checklist items written by hand", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("adds a checklist item with no assessment behind it, creating the assessment shell", async () => {
    // The gap this closes: the checklist could only ever hold what an
    // assessment run had generated, so a focus area nobody had generated yet
    // had nowhere to put a governance action a consultant already knew about.
    const result = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      focusArea: "BOARD_STRUCTURE",
      phase: "IMMEDIATE",
      title: "Appoint an audit committee chair",
      description: "The board has no named chair for the audit committee.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const item = await prisma.governanceChecklistItem.findUniqueOrThrow({
      where: { id: result.data.id },
      include: { assessment: true },
    });
    expect(item.phase).toBe("IMMEDIATE");
    expect(item.status).toBe("OPEN");
    expect(item.assessment.workspaceId).toBe(fixture.workspace.id);
    expect(item.assessment.focusArea).toBe("BOARD_STRUCTURE");
    // No AI ever ran for this focus area — the shell it needed carries no summary.
    expect(item.assessment.summary).toBe("");
  });

  it("adds a second item to a focus area that already has an assessment, without creating a second one", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(generated.ok).toBe(true);

    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
      phase: "NEAR_TERM",
      title: "Schedule a penetration test",
      description: "Nothing in the generated checklist covers this.",
    });
    expect(added.ok).toBe(true);

    const assessments = await prisma.governanceAssessment.findMany({
      where: { workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" },
    });
    expect(assessments).toHaveLength(1);
    // The AI-written summary from the earlier generate is untouched by the upsert.
    expect(assessments[0]!.summary).toBe(outcome().data.summary);
  });

  it("edits a hand-written item's phase, title and description, and deletes it", async () => {
    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      focusArea: "ETHICS_POLICY",
      phase: "IMMEDIATE",
      title: "Draft title",
      description: "First cut.",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const edited = await updateGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      itemId: added.data.id,
      phase: "LONG_TERM",
      title: "Publish a whistleblower policy",
      description: "A fuller second cut.",
    });
    expect(edited.ok).toBe(true);

    const afterEdit = await prisma.governanceChecklistItem.findUniqueOrThrow({ where: { id: added.data.id } });
    expect(afterEdit.phase).toBe("LONG_TERM");
    expect(afterEdit.title).toBe("Publish a whistleblower policy");
    expect(afterEdit.description).toBe("A fuller second cut.");
    // Editing text is not the same action as marking status — it must not move.
    expect(afterEdit.status).toBe("OPEN");

    const removed = await deleteGovernanceChecklistItem({ workspaceId: fixture.workspace.id, itemId: added.data.id });
    expect(removed.ok).toBe(true);
    expect(await prisma.governanceChecklistItem.findUnique({ where: { id: added.data.id } })).toBeNull();
  });

  it("refuses to touch a checklist item belonging to another workspace", async () => {
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernanceChecklistItem({
      workspaceId: other.workspace.id,
      focusArea: "COMPENSATION",
      phase: "IMMEDIATE",
      title: "Theirs",
      description: "Not yours.",
    });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const edit = await updateGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      itemId: theirs.data.id,
      title: "Rewritten from the wrong workspace",
    });
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error).toBe("NOT_FOUND");

    const remove = await deleteGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      itemId: theirs.data.id,
    });
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error).toBe("NOT_FOUND");

    await other.cleanup();
  });

  it("survives a regenerate that returns a different item with the same title", async () => {
    // The same title-tracking protection FR-014 already gives an AI-surfaced
    // item covers a hand-added one too: partitionNewChecklistItems treats
    // every existing title as tracked, regardless of who created the row.
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
      phase: "IMMEDIATE",
      title: "Establish a risk committee",
      description: "Written by hand before any assessment ran.",
    });
    expect(added.ok).toBe(true);

    mockRunGovernanceAssessment.mockResolvedValue(outcome()); // its checklist also names "Establish a risk committee"
    const regenerated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(regenerated.ok).toBe(true);

    const items = await prisma.governanceChecklistItem.findMany({
      where: { assessment: { workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" } },
    });
    const risk = items.filter((i) => i.title === "Establish a risk committee");
    expect(risk).toHaveLength(1);
    expect(risk[0]!.description).toBe("Written by hand before any assessment ran.");
  });
});

describe("Governance access gating", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockReset();
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("refuses a VIEWER on every governance write", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const results = await Promise.all([
      setGovernanceProfile({ workspaceId: fixture.workspace.id, companySize: "x", jurisdiction: "x" }),
      generateGovernanceAssessment({ workspaceId: fixture.workspace.id, focusArea: "RISK_CONTROLS" }),
      addGovernanceRisk({
        workspaceId: fixture.workspace.id,
        title: "t",
        description: "d",
        likelihood: "LOW",
        impact: "LOW",
      }),
      addGovernanceChecklistItem({
        workspaceId: fixture.workspace.id,
        focusArea: "RISK_CONTROLS",
        phase: "IMMEDIATE",
        title: "t",
        description: "d",
      }),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    }
  });

  it("allows an EDITOR to generate an assessment", async () => {
    const { user: editor } = await fixture.addMember("EDITOR");
    mockAuth.mockResolvedValue({ user: { id: editor.id } });

    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      focusArea: "RISK_CONTROLS",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNAUTHORIZED");
  });
});
