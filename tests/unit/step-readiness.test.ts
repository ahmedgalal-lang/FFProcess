import { describe, it, expect } from "vitest";
import { deriveGapsByStep, STEP_GAP_LABELS, type ReadinessInput } from "@/lib/domain/step-readiness";
import type { TableStep } from "@/lib/domain/raci-table";
import type { AuthorityAssignmentData } from "@/lib/domain/authority-table";

function step(overrides: Partial<TableStep> & { id: string }): TableStep {
  return { type: "TASK", label: overrides.id, raciSkipped: false, ...overrides };
}

function authority(overrides: Partial<AuthorityAssignmentData>): AuthorityAssignmentData {
  return {
    activityId: null,
    stepId: null,
    skipped: false,
    slaDays: null,
    threshold: null,
    direction: "GREATER_THAN",
    approverRoleId: null,
    approverPersonId: null,
    coApprovalAboveThreshold: null,
    coApproverRoleId: null,
    escalationRoleId: null,
    ...overrides,
  };
}

function derive(input: Partial<ReadinessInput> & { steps: TableStep[] }) {
  return deriveGapsByStep({
    activities: [],
    authorityAssignments: [],
    incomingStepIds: new Set(),
    ...input,
  });
}

describe("deriveGapsByStep", () => {
  it("gives every step an entry, so a caller never has to check for one", () => {
    const gaps = derive({ steps: [step({ id: "s1", type: "START" })] });
    expect(gaps.has("s1")).toBe(true);
  });

  it("flags a step nothing connects into", () => {
    const gaps = derive({ steps: [step({ id: "s1" })] });
    expect(gaps.get("s1")).toContain("PREDECESSOR");
  });

  it("lets a START step begin the flow without a predecessor", () => {
    const gaps = derive({ steps: [step({ id: "s1", type: "START" })] });
    expect(gaps.get("s1")).not.toContain("PREDECESSOR");
  });

  it("still expects an END step to be fed by something", () => {
    const gaps = derive({ steps: [step({ id: "s1", type: "END" })] });
    expect(gaps.get("s1")).toContain("PREDECESSOR");
  });

  it("clears the predecessor gap once something connects in", () => {
    const gaps = derive({ steps: [step({ id: "s1" })], incomingStepIds: new Set(["s1"]) });
    expect(gaps.get("s1")).not.toContain("PREDECESSOR");
  });

  it("flags every hole in a step nobody has documented yet", () => {
    // The Authority Matrix gives every step a row whether or not anyone has
    // filled one in, and flags the ones with no approver — so an untouched
    // step is missing an approver as surely as it is missing an A and an R.
    const gaps = derive({ steps: [step({ id: "s1" })] });
    expect(gaps.get("s1")).toEqual(["PREDECESSOR", "ACCOUNTABLE", "RESPONSIBLE", "APPROVER"]);
  });

  it("says nothing about RACI on a step deliberately skipped", () => {
    const gaps = derive({ steps: [step({ id: "s1", raciSkipped: true })], incomingStepIds: new Set(["s1"]) });
    expect(gaps.get("s1")).toEqual(["APPROVER"]);
  });

  it("reads RACI through the step's activity, not off the step", () => {
    // A step's responsibilities live on its Activities when it has any — the
    // reason this derives gaps through the same builder the matrix uses.
    const gaps = derive({
      steps: [step({ id: "s1" })],
      incomingStepIds: new Set(["s1"]),
      activities: [
        {
          id: "a1",
          name: "Do the thing",
          relatedStepId: "s1",
          order: 0,
          assignments: [
            { roleId: "r1", code: "ACCOUNTABLE" },
            { roleId: "r2", code: "RESPONSIBLE" },
          ],
        },
      ],
      authorityAssignments: [authority({ activityId: "a1", approverRoleId: "r1" })],
    });
    expect(gaps.get("s1")).toEqual([]);
  });

  it("flags a second accountable, the way the matrix does", () => {
    const gaps = derive({
      steps: [step({ id: "s1" })],
      incomingStepIds: new Set(["s1"]),
      activities: [
        {
          id: "a1",
          name: "Do the thing",
          relatedStepId: "s1",
          order: 0,
          assignments: [
            { roleId: "r1", code: "ACCOUNTABLE" },
            { roleId: "r2", code: "ACCOUNTABLE" },
            { roleId: "r3", code: "RESPONSIBLE" },
          ],
        },
      ],
      authorityAssignments: [authority({ activityId: "a1", approverRoleId: "r1" })],
    });
    expect(gaps.get("s1")).toEqual(["TOO_MANY_ACCOUNTABLE"]);
  });

  it("reports one gap per step even when several of its activities share it", () => {
    const gaps = derive({
      steps: [step({ id: "s1" })],
      incomingStepIds: new Set(["s1"]),
      activities: [
        { id: "a1", name: "One", relatedStepId: "s1", order: 0, assignments: [] },
        { id: "a2", name: "Two", relatedStepId: "s1", order: 1, assignments: [] },
      ],
    });
    // Both activities are missing all three, and the step says each once.
    expect(gaps.get("s1")).toEqual(["ACCOUNTABLE", "RESPONSIBLE", "APPROVER"]);
  });

  it("finds an authority rule attached to the step's activity, not just to the step", () => {
    // The bug this test exists for: an assignment is keyed by activityId when
    // the step has an Activity, so looking only at stepId reported a missing
    // approver on steps that had one.
    const gaps = derive({
      steps: [step({ id: "s1" })],
      incomingStepIds: new Set(["s1"]),
      activities: [
        {
          id: "a1",
          name: "Do the thing",
          relatedStepId: "s1",
          order: 0,
          assignments: [
            { roleId: "r1", code: "ACCOUNTABLE" },
            { roleId: "r2", code: "RESPONSIBLE" },
          ],
        },
      ],
      authorityAssignments: [authority({ activityId: "a1", approverRoleId: "r1" })],
    });
    expect(gaps.get("s1")).toEqual([]);
  });

  it("flags a missing approver", () => {
    const gaps = derive({
      steps: [step({ id: "s1", raciSkipped: true })],
      incomingStepIds: new Set(["s1"]),
      authorityAssignments: [authority({ stepId: "s1" })],
    });
    expect(gaps.get("s1")).toEqual(["APPROVER"]);
  });

  it("says nothing about an approver where the rule needs no approval", () => {
    const gaps = derive({
      steps: [step({ id: "s1", raciSkipped: true })],
      incomingStepIds: new Set(["s1"]),
      authorityAssignments: [authority({ stepId: "s1", direction: "EQUAL_NO_APPROVAL" })],
    });
    expect(gaps.get("s1")).toEqual([]);
  });

  it("says nothing about an approver on a skipped authority row", () => {
    const gaps = derive({
      steps: [step({ id: "s1", raciSkipped: true })],
      incomingStepIds: new Set(["s1"]),
      authorityAssignments: [authority({ stepId: "s1", skipped: true })],
    });
    expect(gaps.get("s1")).toEqual([]);
  });

  it("flags a co-approval threshold with nobody to co-approve it", () => {
    const gaps = derive({
      steps: [step({ id: "s1", raciSkipped: true })],
      incomingStepIds: new Set(["s1"]),
      authorityAssignments: [
        authority({ stepId: "s1", approverRoleId: "r1", coApprovalAboveThreshold: 50000 }),
      ],
    });
    expect(gaps.get("s1")).toEqual(["CO_APPROVER"]);
  });

  it("lists a brand-new step's gaps in the order they get filled", () => {
    const gaps = derive({
      steps: [step({ id: "s1" })],
      authorityAssignments: [authority({ stepId: "s1" })],
    });
    expect(gaps.get("s1")).toEqual(["PREDECESSOR", "ACCOUNTABLE", "RESPONSIBLE", "APPROVER"]);
  });

  it("has a short label for every gap it can report", () => {
    const gaps = derive({
      steps: [step({ id: "s1" })],
      authorityAssignments: [authority({ stepId: "s1" })],
    });
    for (const gap of gaps.get("s1")!) expect(STEP_GAP_LABELS[gap]).toBeTruthy();
  });
});
