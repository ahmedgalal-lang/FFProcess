import { describe, expect, it } from "vitest";
import {
  findStructuralGaps,
  buildProcessReviewPrompt,
  type ReviewStep,
  type ReviewConnection,
  type ProcessReviewContext,
} from "@/lib/domain/process-review";

describe("findStructuralGaps", () => {
  it("returns no gaps for a well-formed START -> TASK -> END chain", () => {
    const steps: ReviewStep[] = [
      { id: "s1", type: "START", label: "Start" },
      { id: "s2", type: "TASK", label: "Do the thing" },
      { id: "s3", type: "END", label: "End" },
    ];
    const connections: ReviewConnection[] = [
      { fromStepId: "s1", toStepId: "s2" },
      { fromStepId: "s2", toStepId: "s3" },
    ];
    expect(findStructuralGaps(steps, connections)).toEqual([]);
  });

  it("flags a missing START and missing END", () => {
    const steps: ReviewStep[] = [{ id: "s1", type: "TASK", label: "Do the thing" }];
    expect(findStructuralGaps(steps, [])).toEqual(
      expect.arrayContaining([{ type: "MISSING_START" }, { type: "MISSING_END" }])
    );
  });

  it("flags a step with no connections at all when other steps exist", () => {
    const steps: ReviewStep[] = [
      { id: "s1", type: "START", label: "Start" },
      { id: "s2", type: "TASK", label: "Orphan" },
      { id: "s3", type: "END", label: "End" },
    ];
    const connections: ReviewConnection[] = [{ fromStepId: "s1", toStepId: "s3" }];
    expect(findStructuralGaps(steps, connections)).toContainEqual({
      type: "ISOLATED_STEP",
      stepId: "s2",
      label: "Orphan",
    });
  });

  it("does not flag a lone step in a single-step process as isolated", () => {
    const steps: ReviewStep[] = [{ id: "s1", type: "START", label: "Start" }];
    expect(findStructuralGaps(steps, [])).not.toContainEqual(
      expect.objectContaining({ type: "ISOLATED_STEP" })
    );
  });

  it("flags a DECISION step with only one outgoing branch", () => {
    const steps: ReviewStep[] = [
      { id: "s1", type: "START", label: "Start" },
      { id: "s2", type: "DECISION", label: "Approved?" },
      { id: "s3", type: "END", label: "End" },
    ];
    const connections: ReviewConnection[] = [
      { fromStepId: "s1", toStepId: "s2" },
      { fromStepId: "s2", toStepId: "s3" },
    ];
    expect(findStructuralGaps(steps, connections)).toContainEqual({
      type: "DECISION_SINGLE_BRANCH",
      stepId: "s2",
      label: "Approved?",
    });
  });

  it("does not flag a DECISION step with two outgoing branches", () => {
    const steps: ReviewStep[] = [
      { id: "s1", type: "DECISION", label: "Approved?" },
      { id: "s2", type: "END", label: "Yes path" },
      { id: "s3", type: "END", label: "No path" },
    ];
    const connections: ReviewConnection[] = [
      { fromStepId: "s1", toStepId: "s2" },
      { fromStepId: "s1", toStepId: "s3" },
    ];
    expect(findStructuralGaps(steps, connections)).not.toContainEqual(
      expect.objectContaining({ type: "DECISION_SINGLE_BRANCH" })
    );
  });

  it("returns no gaps for an empty Process Map", () => {
    expect(findStructuralGaps([], [])).toEqual([]);
  });
});

describe("buildProcessReviewPrompt", () => {
  const baseContext: ProcessReviewContext = {
    workspaceName: "Acme Consulting",
    processCode: "PUR100",
    processName: "Purchase to Pay",
    processDescription: null,
    steps: [
      {
        type: "START",
        label: "Requisition raised",
        assignedRoleName: "Clerk",
        swimlaneRoleName: "Clerk",
        linkedProcessCodes: [],
      },
    ],
    connections: [],
    raci: {
      matrixStatus: "DRAFT",
      activities: [{ id: "a1", name: "Approve invoice", assignments: [{ roleName: "Manager", code: "ACCOUNTABLE" }] }],
      issues: [{ activityId: "a1", type: "MISSING_RESPONSIBLE", roleIds: [] }],
    },
    authority: {
      decisionTypes: [
        { name: "Purchase Order", rules: [{ approverLabel: "Manager", maxThreshold: 5000, coApproverLabel: null }] },
      ],
      conflicts: [],
    },
    structuralGaps: [{ type: "MISSING_END" }],
  };

  it("includes the process identity, workspace name, and each section header", () => {
    const prompt = buildProcessReviewPrompt(baseContext);
    expect(prompt).toContain("PUR100");
    expect(prompt).toContain("Purchase to Pay");
    expect(prompt).toContain("Acme Consulting");
    expect(prompt).toContain("## Process Map");
    expect(prompt).toContain("## RACI Matrix");
    expect(prompt).toContain("## Authority Matrix");
  });

  it("renders steps, RACI assignments, and authority rules by name", () => {
    const prompt = buildProcessReviewPrompt(baseContext);
    expect(prompt).toContain("Requisition raised");
    expect(prompt).toContain("Approve invoice");
    expect(prompt).toContain("Manager=ACCOUNTABLE");
    expect(prompt).toContain("Purchase Order");
  });

  it("surfaces already-detected mechanical issues so the model doesn't have to rediscover them", () => {
    const prompt = buildProcessReviewPrompt(baseContext);
    expect(prompt).toContain("The map has no END step.");
    expect(prompt).toContain('Activity "Approve invoice" has no Responsible role.');
  });

  it("handles an empty process with no steps or activities", () => {
    const empty: ProcessReviewContext = {
      ...baseContext,
      steps: [],
      connections: [],
      raci: { matrixStatus: "DRAFT", activities: [], issues: [] },
      structuralGaps: [],
    };
    const prompt = buildProcessReviewPrompt(empty);
    expect(prompt).toContain("No steps have been added yet.");
    expect(prompt).toContain("No activities have been added yet.");
    expect(prompt).toContain("(none)");
  });
});
