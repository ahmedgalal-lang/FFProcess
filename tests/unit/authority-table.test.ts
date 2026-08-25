import { describe, it, expect } from "vitest";
import {
  buildAuthorityTableRows,
  validateAuthorityTable,
  type TableStep,
  type TableActivity,
  type AuthorityAssignmentData,
} from "@/lib/domain/authority-table";

function assignment(overrides: Partial<AuthorityAssignmentData>): AuthorityAssignmentData {
  return {
    activityId: null,
    stepId: null,
    skipped: false,
    unit: "MONEY",
    threshold: null,
    approverRoleId: null,
    approverPersonId: null,
    coApprovalAboveThreshold: null,
    coApproverRoleId: null,
    ...overrides,
  };
}

describe("buildAuthorityTableRows", () => {
  it("shows a step with no linked Activity and no assignment as an empty, unskipped row", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO" }];
    const rows = buildAuthorityTableRows(steps, [], []);
    expect(rows).toEqual([
      {
        id: "s1",
        kind: "step",
        stepId: "s1",
        stepType: "TASK",
        label: "Create PO",
        skipped: false,
        unit: "MONEY",
        threshold: null,
        approverRoleId: null,
        approverPersonId: null,
        coApprovalAboveThreshold: null,
        coApproverRoleId: null,
      },
    ]);
  });

  it("merges a step-scoped assignment into that step's row by stepId", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO" }];
    const assignments = [
      assignment({ stepId: "s1", unit: "MONEY", threshold: 5000, approverRoleId: "r1" }),
    ];
    const rows = buildAuthorityTableRows(steps, [], assignments);
    expect(rows[0]).toMatchObject({ threshold: 5000, approverRoleId: "r1" });
  });

  it("uses the linked Activity's name and merges its assignment by activityId", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO" }];
    const activities: TableActivity[] = [
      { id: "a1", name: "Create Purchase Order", relatedStepId: "s1", order: 0 },
    ];
    const assignments = [assignment({ activityId: "a1", unit: "DAYS", threshold: 3, approverPersonId: "p1" })];
    const rows = buildAuthorityTableRows(steps, activities, assignments);
    expect(rows).toEqual([
      {
        id: "a1",
        kind: "activity",
        stepId: "s1",
        stepType: "TASK",
        label: "Create Purchase Order",
        skipped: false,
        unit: "DAYS",
        threshold: 3,
        approverRoleId: null,
        approverPersonId: "p1",
        coApprovalAboveThreshold: null,
        coApproverRoleId: null,
      },
    ]);
  });

  it("shows every Activity linked to the same step as its own row", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Match & Approve" }];
    const activities: TableActivity[] = [
      { id: "a1", name: "Match Invoice to PO", relatedStepId: "s1", order: 0 },
      { id: "a2", name: "Approve Payment", relatedStepId: "s1", order: 1 },
    ];
    const rows = buildAuthorityTableRows(steps, activities, []);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("appends a freestanding Activity after every step row, ordered by `order`", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO" }];
    const activities: TableActivity[] = [
      { id: "a2", name: "Approve Payment", relatedStepId: null, order: 1 },
      { id: "a1", name: "Match Invoice to PO", relatedStepId: null, order: 0 },
    ];
    const rows = buildAuthorityTableRows(steps, activities, []);
    expect(rows.map((r) => r.id)).toEqual(["s1", "a1", "a2"]);
  });

  it("carries the skipped flag through for a step row", () => {
    const steps: TableStep[] = [{ id: "s1", type: "START", label: "Start" }];
    const assignments = [assignment({ stepId: "s1", skipped: true })];
    const rows = buildAuthorityTableRows(steps, [], assignments);
    expect(rows[0]).toMatchObject({ skipped: true });
  });

  it("handles no steps and no activities", () => {
    expect(buildAuthorityTableRows([], [], [])).toEqual([]);
  });
});

function row(overrides: Partial<AuthorityAssignmentData> = {}) {
  const a = assignment(overrides);
  return {
    id: "r1",
    kind: "activity" as const,
    stepId: null,
    stepType: null,
    label: "Row",
    skipped: a.skipped,
    unit: a.unit,
    threshold: a.threshold,
    approverRoleId: a.approverRoleId,
    approverPersonId: a.approverPersonId,
    coApprovalAboveThreshold: a.coApprovalAboveThreshold,
    coApproverRoleId: a.coApproverRoleId,
  };
}

describe("validateAuthorityTable", () => {
  it("flags a non-skipped row with no approver", () => {
    const issues = validateAuthorityTable([row()]);
    expect(issues).toEqual([{ rowId: "r1", type: "MISSING_APPROVER" }]);
  });

  it("does not flag a skipped row even with no approver", () => {
    expect(validateAuthorityTable([row({ skipped: true })])).toEqual([]);
  });

  it("does not flag a row with a Role approver assigned", () => {
    expect(validateAuthorityTable([row({ approverRoleId: "r1" })])).toEqual([]);
  });

  it("does not flag a row with a Person approver assigned", () => {
    expect(validateAuthorityTable([row({ approverPersonId: "p1" })])).toEqual([]);
  });

  it("flags a row with a co-approval threshold but no co-approver", () => {
    const issues = validateAuthorityTable([row({ approverRoleId: "r1", coApprovalAboveThreshold: 50000 })]);
    expect(issues).toEqual([{ rowId: "r1", type: "MISSING_CO_APPROVER" }]);
  });

  it("does not flag a row with a co-approval threshold and a co-approver assigned", () => {
    const issues = validateAuthorityTable([
      row({ approverRoleId: "r1", coApprovalAboveThreshold: 50000, coApproverRoleId: "r2" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("can flag both missing approver and missing co-approver on the same row", () => {
    const issues = validateAuthorityTable([row({ coApprovalAboveThreshold: 50000 })]);
    expect(issues).toEqual([
      { rowId: "r1", type: "MISSING_APPROVER" },
      { rowId: "r1", type: "MISSING_CO_APPROVER" },
    ]);
  });
});
