import { describe, expect, it } from "vitest";
import { validateRaciMatrix, type RaciActivity } from "@/lib/domain/raci-validation";

function activity(overrides: Partial<RaciActivity> = {}): RaciActivity {
  return {
    activityId: "act-1",
    name: "Create Purchase Order",
    assignments: [],
    ...overrides,
  };
}

describe("validateRaciMatrix", () => {
  it("flags an activity with no Accountable Role", () => {
    const issues = validateRaciMatrix([
      activity({
        assignments: [
          { roleId: "r1", code: "RESPONSIBLE" },
          { roleId: "r2", code: "INFORMED" },
        ],
      }),
    ]);
    expect(issues).toEqual([
      { activityId: "act-1", type: "MISSING_ACCOUNTABLE", roleIds: [] },
    ]);
  });

  it("flags an activity with more than one Accountable Role", () => {
    const issues = validateRaciMatrix([
      activity({
        assignments: [
          { roleId: "r1", code: "ACCOUNTABLE" },
          { roleId: "r2", code: "ACCOUNTABLE" },
          { roleId: "r3", code: "RESPONSIBLE" },
        ],
      }),
    ]);
    expect(issues).toContainEqual({
      activityId: "act-1",
      type: "MULTIPLE_ACCOUNTABLE",
      roleIds: ["r1", "r2"],
    });
  });

  it("flags an activity with no Responsible Role", () => {
    const issues = validateRaciMatrix([
      activity({
        assignments: [{ roleId: "r1", code: "ACCOUNTABLE" }],
      }),
    ]);
    expect(issues).toContainEqual({
      activityId: "act-1",
      type: "MISSING_RESPONSIBLE",
      roleIds: [],
    });
  });

  it("passes a well-formed activity with exactly one Accountable and one Responsible", () => {
    const issues = validateRaciMatrix([
      activity({
        assignments: [
          { roleId: "r1", code: "RESPONSIBLE" },
          { roleId: "r2", code: "ACCOUNTABLE" },
          { roleId: "r3", code: "CONSULTED" },
          { roleId: "r4", code: "INFORMED" },
        ],
      }),
    ]);
    expect(issues).toEqual([]);
  });

  it("a single Role can hold both Responsible and Accountable for the same activity", () => {
    const issues = validateRaciMatrix([
      activity({
        assignments: [{ roleId: "r1", code: "ACCOUNTABLE" }],
      }),
    ]);
    // still missing Responsible in this case since only one assignment exists
    expect(issues).toContainEqual({
      activityId: "act-1",
      type: "MISSING_RESPONSIBLE",
      roleIds: [],
    });
  });

  it("checks every activity independently and reports multiple issues", () => {
    const issues = validateRaciMatrix([
      activity({ activityId: "act-1", assignments: [] }),
      activity({
        activityId: "act-2",
        assignments: [
          { roleId: "r1", code: "RESPONSIBLE" },
          { roleId: "r2", code: "ACCOUNTABLE" },
        ],
      }),
    ]);
    expect(issues.map((i) => i.activityId)).toEqual(
      expect.arrayContaining(["act-1"])
    );
    expect(issues.filter((i) => i.activityId === "act-2")).toEqual([]);
  });
});
