import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace, createGovernanceAspect } from "./fixtures";

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
  deleteGovernanceRisk,
  updateGovernanceSummary,
  addGovernanceAspect,
  renameGovernanceAspect,
  deleteGovernanceAspect,
  submitPolicyForReview,
  approvePolicyDraft,
  publishPolicyDraft,
  retirePolicyDraft,
  setPolicyReviewDueDate,
  markPolicyAcknowledgement,
  unmarkPolicyAcknowledgement,
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
  let riskControlsAspectId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
    riskControlsAspectId = (await createGovernanceAspect(fixture.workspace.id, "Risk & Internal Controls")).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("refuses to generate before the profile (industry/size/jurisdiction) is set, without calling the model", async () => {
    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspectId,
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
      aspectId: riskControlsAspectId,
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
      aspectId: riskControlsAspectId,
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

    const first = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });
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
    const second = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });
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

    const first = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });
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
    await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });

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

  it("does not overwrite a hand-edited summary on regenerate, but still refreshes the checklist", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());

    const first = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const edited = await updateGovernanceSummary({
      workspaceId: fixture.workspace.id,
      assessmentId: first.data.assessmentId,
      summary: "A consultant's own rewrite of the summary.",
    });
    expect(edited.ok).toBe(true);

    // Regenerate, with a model response carrying a different summary and one
    // genuinely new checklist item — the hand edit must survive while the
    // rest of the run still lands.
    mockRunGovernanceAssessment.mockResolvedValue(
      outcome({
        summary: "A fresh AI summary that must not overwrite the hand-edited one.",
        checklist: [
          {
            phase: "near_term",
            title: "Adopt a new whistleblower channel",
            description: "A second finding from this run.",
            policyTitle: null,
            riskTitle: null,
          },
        ],
      })
    );
    const regenerated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspectId,
    });
    expect(regenerated.ok).toBe(true);

    const assessmentAfter = await prisma.governanceAssessment.findUniqueOrThrow({
      where: { id: first.data.assessmentId },
    });
    expect(assessmentAfter.summary).toBe("A consultant's own rewrite of the summary.");
    expect(assessmentAfter.summaryHandEdited).toBe(true);

    // The checklist still refreshed — protection is scoped to the summary alone.
    const items = await prisma.governanceChecklistItem.findMany({ where: { assessmentId: first.data.assessmentId } });
    expect(items.map((i) => i.title)).toContain("Adopt a new whistleblower channel");
  });

  it("refuses to touch a summary belonging to another workspace", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspectId,
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const edit = await updateGovernanceSummary({
      workspaceId: other.workspace.id,
      assessmentId: generated.data.assessmentId,
      summary: "Rewritten from the wrong workspace.",
    });
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error).toBe("NOT_FOUND");

    await other.cleanup();
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
    await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId });

    const riskAfter = await prisma.governanceRisk.findUnique({ where: { id: added.data.id } });
    expect(riskAfter?.description).toBe("Flagged by the engagement lead before any assessment ran.");
    expect(riskAfter?.likelihood).toBe("MEDIUM");

    const allRisks = await prisma.governanceRisk.count({ where: { workspaceId: fixture.workspace.id } });
    expect(allRisks).toBe(1); // not duplicated by title
  });

  it("deletes a risk outright, whether it was hand-added or AI-surfaced", async () => {
    const handAdded = await addGovernanceRisk({
      workspaceId: fixture.workspace.id,
      title: "Single supplier for a critical component",
      description: "No qualified backup vendor.",
      likelihood: "HIGH",
      impact: "HIGH",
    });
    expect(handAdded.ok).toBe(true);
    if (!handAdded.ok) return;

    const removed = await deleteGovernanceRisk({ workspaceId: fixture.workspace.id, riskId: handAdded.data.id });
    expect(removed.ok).toBe(true);
    expect(await prisma.governanceRisk.findUnique({ where: { id: handAdded.data.id } })).toBeNull();
  });

  it("refuses to delete a risk belonging to another workspace", async () => {
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernanceRisk({
      workspaceId: other.workspace.id,
      title: "Theirs",
      description: "Not yours.",
      likelihood: "LOW",
      impact: "LOW",
    });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const remove = await deleteGovernanceRisk({ workspaceId: fixture.workspace.id, riskId: theirs.data.id });
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error).toBe("NOT_FOUND");
    expect(await prisma.governanceRisk.findUnique({ where: { id: theirs.data.id } })).not.toBeNull();

    await other.cleanup();
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
    const boardAspect = await createGovernanceAspect(fixture.workspace.id, "Board Structure");
    const result = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      aspectId: boardAspect.id,
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
    expect(item.assessment.aspectId).toBe(boardAspect.id);
    // No AI ever ran for this aspect — the shell it needed carries no summary.
    expect(item.assessment.summary).toBe("");
  });

  it("adds a second item to an aspect that already has an assessment, without creating a second one", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const riskControlsAspect = await createGovernanceAspect(fixture.workspace.id, "Risk & Internal Controls");
    const generated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspect.id,
    });
    expect(generated.ok).toBe(true);

    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspect.id,
      phase: "NEAR_TERM",
      title: "Schedule a penetration test",
      description: "Nothing in the generated checklist covers this.",
    });
    expect(added.ok).toBe(true);

    const assessments = await prisma.governanceAssessment.findMany({
      where: { workspaceId: fixture.workspace.id, aspectId: riskControlsAspect.id },
    });
    expect(assessments).toHaveLength(1);
    // The AI-written summary from the earlier generate is untouched by the upsert.
    expect(assessments[0]!.summary).toBe(outcome().data.summary);
  });

  it("edits a hand-written item's phase, title and description, and deletes it", async () => {
    const ethicsAspect = await createGovernanceAspect(fixture.workspace.id, "Ethics Policy");
    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      aspectId: ethicsAspect.id,
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
    const theirAspect = await createGovernanceAspect(other.workspace.id, "Compensation");
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernanceChecklistItem({
      workspaceId: other.workspace.id,
      aspectId: theirAspect.id,
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
    const riskControlsAspect = await createGovernanceAspect(fixture.workspace.id, "Risk & Internal Controls");
    const added = await addGovernanceChecklistItem({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspect.id,
      phase: "IMMEDIATE",
      title: "Establish a risk committee",
      description: "Written by hand before any assessment ran.",
    });
    expect(added.ok).toBe(true);

    mockRunGovernanceAssessment.mockResolvedValue(outcome()); // its checklist also names "Establish a risk committee"
    const regenerated = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspect.id,
    });
    expect(regenerated.ok).toBe(true);

    const items = await prisma.governanceChecklistItem.findMany({
      where: { assessment: { workspaceId: fixture.workspace.id, aspectId: riskControlsAspect.id } },
    });
    const risk = items.filter((i) => i.title === "Establish a risk committee");
    expect(risk).toHaveLength(1);
    expect(risk[0]!.description).toBe("Written by hand before any assessment ran.");
  });
});

describe("Governance access gating", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let riskControlsAspectId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockReset();
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    riskControlsAspectId = (await createGovernanceAspect(fixture.workspace.id, "Risk & Internal Controls")).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("refuses a VIEWER on every governance write", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const results = await Promise.all([
      setGovernanceProfile({ workspaceId: fixture.workspace.id, companySize: "x", jurisdiction: "x" }),
      generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: riskControlsAspectId }),
      addGovernanceRisk({
        workspaceId: fixture.workspace.id,
        title: "t",
        description: "d",
        likelihood: "LOW",
        impact: "LOW",
      }),
      addGovernanceChecklistItem({
        workspaceId: fixture.workspace.id,
        aspectId: riskControlsAspectId,
        phase: "IMMEDIATE",
        title: "t",
        description: "d",
      }),
      deleteGovernanceRisk({ workspaceId: fixture.workspace.id, riskId: "does-not-matter" }),
      updateGovernanceSummary({ workspaceId: fixture.workspace.id, assessmentId: "does-not-matter", summary: "x" }),
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
      aspectId: riskControlsAspectId,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await generateGovernanceAssessment({
      workspaceId: fixture.workspace.id,
      aspectId: riskControlsAspectId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNAUTHORIZED");
  });
});

describe("Governance aspects (add / rename / delete)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("adds a new aspect", async () => {
    const result = await addGovernanceAspect({ workspaceId: fixture.workspace.id, name: "Data Privacy" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const aspect = await prisma.governanceAspect.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(aspect.workspaceId).toBe(fixture.workspace.id);
    expect(aspect.name).toBe("Data Privacy");
  });

  it("rejects a duplicate aspect name in the same workspace, but allows it in a different one", async () => {
    const first = await addGovernanceAspect({ workspaceId: fixture.workspace.id, name: "Data Privacy" });
    expect(first.ok).toBe(true);

    const duplicate = await addGovernanceAspect({ workspaceId: fixture.workspace.id, name: "Data Privacy" });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toBe("VALIDATION_ERROR");

    const countInWorkspace = await prisma.governanceAspect.count({
      where: { workspaceId: fixture.workspace.id, name: "Data Privacy" },
    });
    expect(countInWorkspace).toBe(1); // the duplicate created nothing

    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const sameNameElsewhere = await addGovernanceAspect({ workspaceId: other.workspace.id, name: "Data Privacy" });
    expect(sameNameElsewhere.ok).toBe(true);

    await other.cleanup();
  });

  it("rejects a non-EDITOR from adding an aspect", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await addGovernanceAspect({ workspaceId: fixture.workspace.id, name: "Data Privacy" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });

  it("renames an aspect without disturbing anything already tied to it", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    const aspect = await createGovernanceAspect(fixture.workspace.id, "ESG");
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: aspect.id });
    expect(generated.ok).toBe(true);

    const renamed = await renameGovernanceAspect({
      workspaceId: fixture.workspace.id,
      aspectId: aspect.id,
      name: "Sustainability",
    });
    expect(renamed.ok).toBe(true);

    const aspectAfter = await prisma.governanceAspect.findUniqueOrThrow({ where: { id: aspect.id } });
    expect(aspectAfter.name).toBe("Sustainability");

    // The assessment (and everything on it) is still exactly where it was.
    const assessmentAfter = await prisma.governanceAssessment.findUniqueOrThrow({ where: { aspectId: aspect.id } });
    expect(assessmentAfter.summary).toContain("Acme Manufacturing");
  });

  it("rejects renaming an aspect to a name another aspect in the same workspace already has", async () => {
    const a = await createGovernanceAspect(fixture.workspace.id, "ESG");
    const b = await createGovernanceAspect(fixture.workspace.id, "Compensation");

    const rename = await renameGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: a.id, name: "Compensation" });
    expect(rename.ok).toBe(false);
    if (!rename.ok) expect(rename.error).toBe("VALIDATION_ERROR");

    const aAfter = await prisma.governanceAspect.findUniqueOrThrow({ where: { id: a.id } });
    const bAfter = await prisma.governanceAspect.findUniqueOrThrow({ where: { id: b.id } });
    expect(aAfter.name).toBe("ESG");
    expect(bAfter.name).toBe("Compensation");
  });

  it("refuses to rename an aspect belonging to another workspace", async () => {
    const other = await createFixtureWorkspace();
    const theirAspect = await createGovernanceAspect(other.workspace.id, "ESG");

    const rename = await renameGovernanceAspect({
      workspaceId: fixture.workspace.id,
      aspectId: theirAspect.id,
      name: "Renamed from the wrong workspace",
    });
    expect(rename.ok).toBe(false);
    if (!rename.ok) expect(rename.error).toBe("NOT_FOUND");

    await other.cleanup();
  });

  it("deletes an aspect with no assessment cleanly", async () => {
    const aspect = await createGovernanceAspect(fixture.workspace.id, "ESG");
    const result = await deleteGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: aspect.id });
    expect(result.ok).toBe(true);
    expect(await prisma.governanceAspect.findUnique({ where: { id: aspect.id } })).toBeNull();
  });

  it("deleting an aspect removes its own assessment, but a risk and a policy it sourced both survive as hand-added", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    const aspect = await createGovernanceAspect(fixture.workspace.id, "Risk & Internal Controls");
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId: aspect.id });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const item = await prisma.governanceChecklistItem.findFirstOrThrow({
      where: { assessmentId: generated.data.assessmentId, title: "Establish a risk committee" },
    });
    const policy = await prisma.governancePolicyDraft.findFirstOrThrow({ where: { checklistItemId: item.id } });
    const risk = await prisma.governanceRisk.findFirstOrThrow({ where: { sourceItemId: item.id } });

    const deleted = await deleteGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: aspect.id });
    expect(deleted.ok).toBe(true);

    expect(await prisma.governanceAspect.findUnique({ where: { id: aspect.id } })).toBeNull();
    expect(await prisma.governanceAssessment.findUnique({ where: { id: generated.data.assessmentId } })).toBeNull();
    expect(await prisma.governanceChecklistItem.findUnique({ where: { id: item.id } })).toBeNull();

    const policyAfter = await prisma.governancePolicyDraft.findUnique({ where: { id: policy.id } });
    expect(policyAfter).not.toBeNull();
    expect(policyAfter?.checklistItemId).toBeNull();

    const riskAfter = await prisma.governanceRisk.findUnique({ where: { id: risk.id } });
    expect(riskAfter).not.toBeNull();
    expect(riskAfter?.sourceItemId).toBeNull();
  });

  it("refuses to delete an aspect belonging to another workspace", async () => {
    const other = await createFixtureWorkspace();
    const theirAspect = await createGovernanceAspect(other.workspace.id, "ESG");

    const result = await deleteGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: theirAspect.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
    expect(await prisma.governanceAspect.findUnique({ where: { id: theirAspect.id } })).not.toBeNull();

    await other.cleanup();
  });

  it("rejects a non-EDITOR from renaming or deleting an aspect", async () => {
    const aspect = await createGovernanceAspect(fixture.workspace.id, "ESG");
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const rename = await renameGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: aspect.id, name: "Sustainability" });
    expect(rename.ok).toBe(false);
    if (!rename.ok) expect(rename.error).toBe("FORBIDDEN");

    const remove = await deleteGovernanceAspect({ workspaceId: fixture.workspace.id, aspectId: aspect.id });
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error).toBe("FORBIDDEN");
  });
});

describe("Policy Lifecycle — version history and approval workflow (spec 018)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let aspectId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    mockRunGovernanceAssessment.mockReset();
    aspectId = (await createGovernanceAspect(fixture.workspace.id, "Ethics Policy")).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("creates exactly one version at creation, and a new one on every edit, leaving prior versions untouched", async () => {
    const added = await addGovernancePolicy({
      workspaceId: fixture.workspace.id,
      title: "Data Retention Policy",
      body: "First cut.",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const afterCreate = await prisma.governancePolicyVersion.findMany({
      where: { policyId: added.data.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(afterCreate).toHaveLength(1);
    expect(afterCreate[0].versionNumber).toBe(1);
    expect(afterCreate[0].title).toBe("Data Retention Policy");
    expect(afterCreate[0].body).toBe("First cut.");
    expect(afterCreate[0].createdByUserId).toBe(fixture.adminUser.id);

    const edited = await updatePolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      body: "A fuller second cut.",
    });
    expect(edited.ok).toBe(true);

    const afterEdit = await prisma.governancePolicyVersion.findMany({
      where: { policyId: added.data.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(afterEdit).toHaveLength(2);
    expect(afterEdit[0].body).toBe("First cut."); // version 1 unchanged
    expect(afterEdit[1].versionNumber).toBe(2);
    expect(afterEdit[1].body).toBe("A fuller second cut.");
  });

  it("also creates version 1 for a policy drafted by an assessment, attributed to whoever ran it", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const policy = await prisma.governancePolicyDraft.findFirstOrThrow({
      where: { checklistItem: { assessmentId: generated.data.assessmentId } },
    });
    const versions = await prisma.governancePolicyVersion.findMany({ where: { policyId: policy.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].createdByUserId).toBe(fixture.adminUser.id);
  });

  it("moves a policy through submit, approve, publish, and retire, recording the approver and effective date", async () => {
    const added = await addGovernancePolicy({
      workspaceId: fixture.workspace.id,
      title: "Code of Conduct",
      body: "1. Purpose\n2. Scope",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const policyId = added.data.id;

    const submitted = await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId });
    expect(submitted.ok).toBe(true);
    const afterSubmit = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(afterSubmit.lifecycleStatus).toBe("IN_REVIEW");

    const approved = await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(approved.ok).toBe(true);
    const afterApprove = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(afterApprove.lifecycleStatus).toBe("APPROVED");
    expect(afterApprove.approvedByUserId).toBe(fixture.adminUser.id);
    expect(afterApprove.approvedAt).not.toBeNull();

    const published = await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(published.ok).toBe(true);
    const afterPublish = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(afterPublish.lifecycleStatus).toBe("PUBLISHED");
    expect(afterPublish.effectiveDate).not.toBeNull();

    const retired = await retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(retired.ok).toBe(true);
    const afterRetire = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(afterRetire.lifecycleStatus).toBe("RETIRED");
  });

  it("publishPolicyDraft accepts an explicit effectiveDate", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;
    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId: added.data.id });

    const published = await publishPolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      effectiveDate: "2027-01-01",
    });
    expect(published.ok).toBe(true);

    const policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: added.data.id } });
    expect(policy.effectiveDate?.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("resets an Approved or Published policy to Draft when edited, but leaves Draft/In Review untouched", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;
    const policyId = added.data.id;

    // Editing while still Draft: no-op on lifecycleStatus.
    await updatePolicyDraft({ workspaceId: fixture.workspace.id, policyId, body: "Still draft." });
    let policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(policy.lifecycleStatus).toBe("DRAFT");

    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId });
    // Editing while In Review: also no-op (only Approved/Published reset).
    await updatePolicyDraft({ workspaceId: fixture.workspace.id, policyId, body: "Still in review." });
    policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(policy.lifecycleStatus).toBe("IN_REVIEW");

    await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId });

    const editResult = await updatePolicyDraft({
      workspaceId: fixture.workspace.id,
      policyId,
      body: "Edited after publishing.",
    });
    expect(editResult.ok).toBe(true);

    const afterEdit = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policyId } });
    expect(afterEdit.lifecycleStatus).toBe("DRAFT");
    expect(afterEdit.approvedByUserId).toBeNull();
    expect(afterEdit.approvedAt).toBeNull();
  });

  it("rejects each transition from the wrong starting status, naming the actual one", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;
    const policyId = added.data.id;

    const approveFromDraft = await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(approveFromDraft.ok).toBe(false);
    if (!approveFromDraft.ok && approveFromDraft.error === "VALIDATION_ERROR") {
      expect(approveFromDraft.message).toMatch(/draft/i);
    }

    const publishFromDraft = await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(publishFromDraft.ok).toBe(false);

    const retireFromDraft = await retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(retireFromDraft.ok).toBe(false);

    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId });

    const submitAgain = await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId });
    expect(submitAgain.ok).toBe(false);

    const publishFromReview = await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(publishFromReview.ok).toBe(false);

    const retireFromReview = await retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(retireFromReview.ok).toBe(false);
  });

  it("an EDITOR can submit for review but is forbidden from approving, publishing, or retiring", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;
    const policyId = added.data.id;

    const { user: editor } = await fixture.addMember("EDITOR");
    mockAuth.mockResolvedValue({ user: { id: editor.id } });

    const submitted = await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId });
    expect(submitted.ok).toBe(true);

    const approve = await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(approve.ok).toBe(false);
    if (!approve.ok) expect(approve.error).toBe("FORBIDDEN");

    const publish = await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(publish.ok).toBe(false);
    if (!publish.ok) expect(publish.error).toBe("FORBIDDEN");

    const retire = await retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId });
    expect(retire.ok).toBe(false);
    if (!retire.ok) expect(retire.error).toBe("FORBIDDEN");
  });

  it("returns not-found for a mismatched or missing policyId on every new lifecycle action", async () => {
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernancePolicy({ workspaceId: other.workspace.id, title: "Theirs", body: "Not yours." });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const results = await Promise.all([
      submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: theirs.data.id }),
      approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId: theirs.data.id }),
      publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId: theirs.data.id }),
      retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId: theirs.data.id }),
      submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: "does-not-exist" }),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("NOT_FOUND");
    }

    await other.cleanup();
  });

  it("FR-010: regenerating an aspect's assessment never touches a policy that has left Draft", async () => {
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { industry: "Manufacturing", governanceCompanySize: "50-200 employees", governanceJurisdiction: "EU" },
    });
    mockRunGovernanceAssessment.mockResolvedValue(outcome());
    const generated = await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const policy = await prisma.governancePolicyDraft.findFirstOrThrow({
      where: { checklistItem: { assessmentId: generated.data.assessmentId } },
    });

    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: policy.id });
    await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId: policy.id });
    await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId: policy.id });

    const before = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policy.id } });
    expect(before.lifecycleStatus).toBe("PUBLISHED");

    // Regenerate again — the mock returns the exact same titles, as if asked
    // again the model reached the same conclusions.
    await generateGovernanceAssessment({ workspaceId: fixture.workspace.id, aspectId });

    const after = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: policy.id } });
    expect(after.title).toBe(before.title);
    expect(after.body).toBe(before.body);
    expect(after.lifecycleStatus).toBe("PUBLISHED");

    // No new version was created either — the regenerate never touched this row.
    const versionCount = await prisma.governancePolicyVersion.count({ where: { policyId: policy.id } });
    expect(versionCount).toBe(1);
  });
});

describe("Policy review-due dates (spec 018)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("sets and clears a review-due date at any lifecycle status", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const set = await setPolicyReviewDueDate({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      reviewDueDate: "2027-06-15",
    });
    expect(set.ok).toBe(true);

    let policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: added.data.id } });
    expect(policy.reviewDueDate?.toISOString().slice(0, 10)).toBe("2027-06-15");

    const cleared = await setPolicyReviewDueDate({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      reviewDueDate: null,
    });
    expect(cleared.ok).toBe(true);

    policy = await prisma.governancePolicyDraft.findUniqueOrThrow({ where: { id: added.data.id } });
    expect(policy.reviewDueDate).toBeNull();
  });

  it("rejects a non-EDITOR from setting a review-due date", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;

    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await setPolicyReviewDueDate({
      workspaceId: fixture.workspace.id,
      policyId: added.data.id,
      reviewDueDate: "2027-06-15",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
  });

  it("returns not-found for a review-due date set on another workspace's policy", async () => {
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await addGovernancePolicy({ workspaceId: other.workspace.id, title: "Theirs", body: "Not yours." });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const result = await setPolicyReviewDueDate({
      workspaceId: fixture.workspace.id,
      policyId: theirs.data.id,
      reviewDueDate: "2027-06-15",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await other.cleanup();
  });
});

describe("Policy acknowledgement tracking (spec 018)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let personId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const person = await prisma.person.create({ data: { workspaceId: fixture.workspace.id, name: "Jamie Consultant" } });
    personId = person.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function publishedPolicy() {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) throw new Error("setup failed");
    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    await publishPolicyDraft({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    return added.data.id;
  }

  it("marks a person as having acknowledged a published policy, and unmarks them", async () => {
    const policyId = await publishedPolicy();

    const marked = await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(marked.ok).toBe(true);

    const ack = await prisma.governancePolicyAcknowledgement.findUnique({
      where: { policyId_personId: { policyId, personId } },
    });
    expect(ack).not.toBeNull();

    // Marking the same person again is idempotent — no duplicate row.
    await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    const count = await prisma.governancePolicyAcknowledgement.count({ where: { policyId, personId } });
    expect(count).toBe(1);

    const unmarked = await unmarkPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(unmarked.ok).toBe(true);
    expect(
      await prisma.governancePolicyAcknowledgement.findUnique({ where: { policyId_personId: { policyId, personId } } })
    ).toBeNull();

    // Unmarking again (already absent) is a no-op, not an error.
    const unmarkedAgain = await unmarkPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(unmarkedAgain.ok).toBe(true);
  });

  it("rejects acknowledgement on a policy that has never been published", async () => {
    const added = await addGovernancePolicy({ workspaceId: fixture.workspace.id, title: "T", body: "B" });
    if (!added.ok) return;

    const draftResult = await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId: added.data.id, personId });
    expect(draftResult.ok).toBe(false);
    if (!draftResult.ok) expect(draftResult.error).toBe("VALIDATION_ERROR");

    await submitPolicyForReview({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    const reviewResult = await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId: added.data.id, personId });
    expect(reviewResult.ok).toBe(false);

    await approvePolicyDraft({ workspaceId: fixture.workspace.id, policyId: added.data.id });
    const approvedResult = await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId: added.data.id, personId });
    expect(approvedResult.ok).toBe(false);
  });

  it("keeps an acknowledgement after the policy is retired", async () => {
    const policyId = await publishedPolicy();
    await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });

    await retirePolicyDraft({ workspaceId: fixture.workspace.id, policyId });

    const ack = await prisma.governancePolicyAcknowledgement.findUnique({
      where: { policyId_personId: { policyId, personId } },
    });
    expect(ack).not.toBeNull();
  });

  it("rejects a non-EDITOR from marking or unmarking an acknowledgement", async () => {
    const policyId = await publishedPolicy();
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const mark = await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(mark.ok).toBe(false);
    if (!mark.ok) expect(mark.error).toBe("FORBIDDEN");

    const unmark = await unmarkPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(unmark.ok).toBe(false);
    if (!unmark.ok) expect(unmark.error).toBe("FORBIDDEN");
  });

  it("rejects a person from another workspace, even against an owned policy", async () => {
    const policyId = await publishedPolicy();
    const other = await createFixtureWorkspace();
    const theirPerson = await prisma.person.create({ data: { workspaceId: other.workspace.id, name: "Not Yours" } });

    const result = await markPolicyAcknowledgement({
      workspaceId: fixture.workspace.id,
      policyId,
      personId: theirPerson.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await other.cleanup();
  });

  it("removes an acknowledgement when the underlying Person is deleted (schema cascade)", async () => {
    const policyId = await publishedPolicy();
    await markPolicyAcknowledgement({ workspaceId: fixture.workspace.id, policyId, personId });
    expect(await prisma.governancePolicyAcknowledgement.count({ where: { personId } })).toBe(1);

    await prisma.person.delete({ where: { id: personId } });

    expect(await prisma.governancePolicyAcknowledgement.count({ where: { personId } })).toBe(0);
  });
});
