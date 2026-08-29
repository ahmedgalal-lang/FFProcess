import { describe, it, expect } from "vitest";
import {
  buildCombinedMatrixRows,
  deriveControlPoints,
  involvedRoleIds,
  describeRoleInvolvement,
  deriveProcessOwnerRoleId,
  deriveDocumentationGaps,
  type CombinedMatrixRow,
} from "@/lib/domain/process-report";

describe("buildCombinedMatrixRows", () => {
  it("joins a RACI row and an Authority row with the same id", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Create PO", stepType: "TASK", skipped: false, assignments: { r1: "RESPONSIBLE" } }],
      [
        {
          id: "a1",
          skipped: false,
          slaDays: 2,
          threshold: 10000,
          direction: "GREATER_THAN",
          approverRoleId: "r1",
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
          escalationRoleId: null,
        },
      ]
    );
    expect(rows).toEqual([
      {
        rowId: "a1",
        label: "Create PO",
        stepType: "TASK",
        skipped: false,
        raciAssignments: { r1: "RESPONSIBLE" },
        slaDays: 2,
        threshold: 10000,
        direction: "GREATER_THAN",
        approverRoleId: "r1",
        approverPersonId: null,
        coApprovalAboveThreshold: null,
        coApproverRoleId: null,
        escalationRoleId: null,
      },
    ]);
  });

  it("fills in empty authority data when a row has no matching Authority entry", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Create PO", stepType: "TASK", skipped: false, assignments: {} }],
      []
    );
    expect(rows[0]).toMatchObject({
      slaDays: null,
      threshold: null,
      direction: "GREATER_THAN",
      approverRoleId: null,
      escalationRoleId: null,
    });
  });

  it("excludes a row skipped in RACI even if not skipped in Authority", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Start", stepType: "START", skipped: true, assignments: {} }],
      [
        {
          id: "a1",
          skipped: false,
          slaDays: null,
          threshold: null,
          direction: "GREATER_THAN",
          approverRoleId: null,
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
          escalationRoleId: null,
        },
      ]
    );
    expect(rows).toEqual([]);
  });

  it("excludes a row skipped in Authority even if not skipped in RACI", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Receive Goods", stepType: "TASK", skipped: false, assignments: {} }],
      [
        {
          id: "a1",
          skipped: true,
          slaDays: null,
          threshold: null,
          direction: "GREATER_THAN",
          approverRoleId: null,
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
          escalationRoleId: null,
        },
      ]
    );
    expect(rows).toEqual([]);
  });
});

function row(overrides: Partial<CombinedMatrixRow>): CombinedMatrixRow {
  return {
    rowId: "r1",
    label: "Approve Purchase Order",
    stepType: "DECISION",
    skipped: false,
    raciAssignments: {},
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

describe("deriveControlPoints", () => {
  const roleNameById = new Map([
    ["controller", "Controller"],
    ["finance-manager", "Finance Manager"],
  ]);

  it("produces no control points for a row with no co-approval threshold", () => {
    expect(deriveControlPoints([row({})], roleNameById)).toEqual([]);
  });

  it("derives a dual-authorization statement when a co-approver is assigned", () => {
    const points = deriveControlPoints(
      [row({ coApprovalAboveThreshold: 50000, coApproverRoleId: "controller" })],
      roleNameById
    );
    expect(points).toEqual([
      {
        rowId: "r1",
        statement:
          '"Approve Purchase Order" above $50,000 requires separate sign-off from Controller in addition to the primary approver.',
        flagged: false,
      },
    ]);
  });

  it("flags a co-approval threshold with no co-approver assigned", () => {
    const points = deriveControlPoints([row({ coApprovalAboveThreshold: 50000, coApproverRoleId: null })], roleNameById);
    expect(points).toHaveLength(1);
    expect(points[0]!.flagged).toBe(true);
    expect(points[0]!.statement).toContain("no co-approver is assigned");
  });

  it("always formats the co-approval limit as money, since amounts are money-only", () => {
    const points = deriveControlPoints(
      [row({ coApprovalAboveThreshold: 3000, coApproverRoleId: "finance-manager" })],
      roleNameById
    );
    expect(points[0]!.statement).toContain("above $3,000");
  });
});

describe("involvedRoleIds", () => {
  it("collects RACI assignees, approvers, and co-approvers, deduplicated", () => {
    const rows = [
      row({ raciAssignments: { "ap-clerk": "RESPONSIBLE", "finance-manager": "ACCOUNTABLE" } }),
      row({ rowId: "r2", approverRoleId: "finance-manager", coApproverRoleId: "controller" }),
    ];
    expect(new Set(involvedRoleIds(rows))).toEqual(new Set(["ap-clerk", "finance-manager", "controller"]));
  });

  it("returns an empty list for rows with no roles at all", () => {
    expect(involvedRoleIds([row({})])).toEqual([]);
  });
});

describe("describeRoleInvolvement", () => {
  it("describes a role that is Accountable and approves a task", () => {
    const rows = [
      row({ rowId: "r1", label: "Approve PO", raciAssignments: { fm: "ACCOUNTABLE" }, approverRoleId: "fm" }),
    ];
    const description = describeRoleInvolvement(rows, "fm");
    expect(description).toContain("Accountable for Approve PO");
    expect(description).toContain("approves Approve PO");
  });

  it("falls back to a generic sentence for a role with no matching data", () => {
    expect(describeRoleInvolvement([row({})], "nobody")).toBe("Involved in this process.");
  });
});

describe("deriveProcessOwnerRoleId", () => {
  it("picks the role most often Accountable", () => {
    const rows = [
      row({ rowId: "r1", raciAssignments: { fm: "ACCOUNTABLE" } }),
      row({ rowId: "r2", raciAssignments: { fm: "ACCOUNTABLE" } }),
      row({ rowId: "r3", raciAssignments: { controller: "ACCOUNTABLE" } }),
    ];
    expect(deriveProcessOwnerRoleId(rows)).toBe("fm");
  });

  it("falls back to the role approving the most tasks when nobody is Accountable", () => {
    const rows = [row({ rowId: "r1", approverRoleId: "controller" }), row({ rowId: "r2", approverRoleId: "controller" })];
    expect(deriveProcessOwnerRoleId(rows)).toBe("controller");
  });

  it("returns null for a process with no RACI or Authority data yet", () => {
    expect(deriveProcessOwnerRoleId([row({})])).toBeNull();
  });
});

describe("deriveDocumentationGaps", () => {
  const full = {
    processPurpose: "Standardizes purchasing.",
    inScope: ["Raising a PO"],
    outOfScope: ["Vendor onboarding"],
    externalEntities: [{ name: "Vendor", description: "Supplies goods." }],
    steps: [{ detailedAction: ["Open the form"], exceptionHandling: "Escalate." }],
    kpis: [{ metric: "Cycle time", target: "3 days", frequency: "Monthly" }],
  };

  it("reports no gaps for a fully documented process", () => {
    expect(deriveDocumentationGaps(full)).toEqual([]);
  });

  it("flags a missing Process Purpose, including a blank one", () => {
    expect(deriveDocumentationGaps({ ...full, processPurpose: null })).toContain("Process Purpose not written");
    expect(deriveDocumentationGaps({ ...full, processPurpose: "   " })).toContain("Process Purpose not written");
  });

  it("flags scope only when both In-Scope and Out-of-Scope are empty", () => {
    expect(deriveDocumentationGaps({ ...full, inScope: [], outOfScope: [] })).toContain(
      "Scope (In-Scope / Out-of-Scope) not documented"
    );
    expect(deriveDocumentationGaps({ ...full, inScope: [] })).not.toContain(
      "Scope (In-Scope / Out-of-Scope) not documented"
    );
  });

  it("flags missing external entities and KPIs", () => {
    expect(deriveDocumentationGaps({ ...full, externalEntities: [] })).toContain("No External Entities documented");
    expect(deriveDocumentationGaps({ ...full, kpis: [] })).toContain("No KPIs added");
  });

  it("counts steps missing both Detailed Action and Exception Handling", () => {
    const gaps = deriveDocumentationGaps({
      ...full,
      steps: [
        { detailedAction: ["Open the form"], exceptionHandling: null },
        { detailedAction: [], exceptionHandling: null },
        { detailedAction: [], exceptionHandling: "   " },
      ],
    });
    expect(gaps).toContain("2 of 3 step(s) missing Detailed Action / Exception Handling");
  });

  it("treats a step with only Exception Handling as documented", () => {
    const gaps = deriveDocumentationGaps({
      ...full,
      steps: [{ detailedAction: [], exceptionHandling: "Escalate to the manager." }],
    });
    expect(gaps.some((g) => g.includes("step(s) missing"))).toBe(false);
  });
});
