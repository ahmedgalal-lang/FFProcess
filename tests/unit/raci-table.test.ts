import { describe, it, expect } from "vitest";
import {
  buildRaciTableRows,
  computeVisibleRoleIds,
  type TableStep,
  type TableActivity,
  type RaciTableRow,
} from "@/lib/domain/raci-table";

describe("buildRaciTableRows", () => {
  it("shows a step with no linked Activity as an empty, unskipped, assignable row", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: false }];
    const rows = buildRaciTableRows(steps, []);
    expect(rows).toEqual([
      { id: "s1", kind: "step", stepId: "s1", stepType: "TASK", label: "Create PO", skipped: false, assignments: {} },
    ]);
  });

  it("shows a skipped step's skipped flag through", () => {
    const steps: TableStep[] = [{ id: "s1", type: "START", label: "Start", raciSkipped: true }];
    const rows = buildRaciTableRows(steps, []);
    expect(rows[0]).toMatchObject({ kind: "step", skipped: true });
  });

  it("uses the linked Activity's name and assignments when a step has one", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: false }];
    const activities: TableActivity[] = [
      {
        id: "a1",
        name: "Create Purchase Order",
        relatedStepId: "s1",
        order: 0,
        assignments: [{ roleId: "r1", code: "RESPONSIBLE" }],
      },
    ];
    const rows = buildRaciTableRows(steps, activities);
    expect(rows).toEqual([
      {
        id: "a1",
        kind: "activity",
        stepId: "s1",
        stepType: "TASK",
        label: "Create Purchase Order",
        skipped: false,
        assignments: { r1: "RESPONSIBLE" },
      },
    ]);
  });

  it("appends a freestanding Activity (no relatedStepId) after every step row, ordered by `order`", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: false }];
    const activities: TableActivity[] = [
      { id: "a2", name: "Approve Payment", relatedStepId: null, order: 1, assignments: [] },
      { id: "a1", name: "Match Invoice to PO", relatedStepId: null, order: 0, assignments: [] },
    ];
    const rows = buildRaciTableRows(steps, activities);
    expect(rows.map((r) => r.id)).toEqual(["s1", "a1", "a2"]);
    expect(rows.slice(1).every((r) => r.kind === "activity" && r.stepId === null)).toBe(true);
  });

  it("preserves step order across a realistic mixed set", () => {
    const steps: TableStep[] = [
      { id: "s1", type: "START", label: "Start", raciSkipped: true },
      { id: "s2", type: "TASK", label: "Create PO", raciSkipped: false },
      { id: "s3", type: "END", label: "End", raciSkipped: true },
    ];
    const activities: TableActivity[] = [
      { id: "a1", name: "Create Purchase Order", relatedStepId: "s2", order: 0, assignments: [] },
      { id: "a2", name: "Match Invoice to PO", relatedStepId: null, order: 0, assignments: [] },
    ];
    const rows = buildRaciTableRows(steps, activities);
    expect(rows.map((r) => r.id)).toEqual(["s1", "a1", "s3", "a2"]);
  });

  it("handles no steps and no activities", () => {
    expect(buildRaciTableRows([], [])).toEqual([]);
  });

  it("shows every Activity linked to the same step as its own row, not just one", () => {
    const steps: TableStep[] = [
      { id: "s1", type: "TASK", label: "Match Invoice & Approve Payment", raciSkipped: false },
    ];
    const activities: TableActivity[] = [
      { id: "a1", name: "Match Invoice to PO", relatedStepId: "s1", order: 0, assignments: [] },
      { id: "a2", name: "Approve Payment", relatedStepId: "s1", order: 1, assignments: [] },
    ];
    const rows = buildRaciTableRows(steps, activities);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(rows.every((r) => r.kind === "activity" && r.stepId === "s1" && r.stepType === "TASK")).toBe(true);
  });

  it("orders multiple Activities on the same step by their `order` field", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Step", raciSkipped: false }];
    const activities: TableActivity[] = [
      { id: "a-second", name: "Second", relatedStepId: "s1", order: 1, assignments: [] },
      { id: "a-first", name: "First", relatedStepId: "s1", order: 0, assignments: [] },
    ];
    const rows = buildRaciTableRows(steps, activities);
    expect(rows.map((r) => r.id)).toEqual(["a-first", "a-second"]);
  });
});

function row(assignments: RaciTableRow["assignments"]): RaciTableRow {
  return { id: "r1", kind: "activity", stepId: null, stepType: null, label: "Row", skipped: false, assignments };
}

describe("computeVisibleRoleIds", () => {
  const allRoleIds = ["clerk", "manager", "cco", "ceo", "hr"];

  it("shows only Roles actually used in an assignment, in the original order", () => {
    const rows = [row({ ceo: "ACCOUNTABLE" }), row({ clerk: "RESPONSIBLE" })];
    expect(computeVisibleRoleIds(allRoleIds, rows, [])).toEqual(["clerk", "ceo"]);
  });

  it("also shows a pinned Role even with zero assignments yet", () => {
    const rows = [row({ clerk: "RESPONSIBLE" })];
    expect(computeVisibleRoleIds(allRoleIds, rows, ["hr"])).toEqual(["clerk", "hr"]);
  });

  it("does not duplicate a Role that is both used and pinned", () => {
    const rows = [row({ clerk: "RESPONSIBLE" })];
    expect(computeVisibleRoleIds(allRoleIds, rows, ["clerk"])).toEqual(["clerk"]);
  });

  it("falls back to every Role when nothing is used or pinned yet", () => {
    const rows = [row({}), row({})];
    expect(computeVisibleRoleIds(allRoleIds, rows, [])).toEqual(allRoleIds);
  });

  it("falls back to every Role for a brand-new matrix with no rows at all", () => {
    expect(computeVisibleRoleIds(allRoleIds, [], [])).toEqual(allRoleIds);
  });
});
