import { describe, it, expect } from "vitest";
import {
  buildCombinedMatrixRows,
  deriveControlPoints,
  buildProcessReportPrompt,
  involvedRoleIds,
  describeRoleInvolvement,
  deriveProcessOwnerRoleId,
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
          unit: "MONEY",
          threshold: 10000,
          approverRoleId: "r1",
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
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
        unit: "MONEY",
        threshold: 10000,
        approverRoleId: "r1",
        approverPersonId: null,
        coApprovalAboveThreshold: null,
        coApproverRoleId: null,
      },
    ]);
  });

  it("fills in empty authority data when a row has no matching Authority entry", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Create PO", stepType: "TASK", skipped: false, assignments: {} }],
      []
    );
    expect(rows[0]).toMatchObject({ threshold: null, approverRoleId: null, unit: "MONEY" });
  });

  it("excludes a row skipped in RACI even if not skipped in Authority", () => {
    const rows = buildCombinedMatrixRows(
      [{ id: "a1", label: "Start", stepType: "START", skipped: true, assignments: {} }],
      [
        {
          id: "a1",
          skipped: false,
          unit: "MONEY",
          threshold: null,
          approverRoleId: null,
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
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
          unit: "MONEY",
          threshold: null,
          approverRoleId: null,
          approverPersonId: null,
          coApprovalAboveThreshold: null,
          coApproverRoleId: null,
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
    unit: "MONEY",
    threshold: null,
    approverRoleId: null,
    approverPersonId: null,
    coApprovalAboveThreshold: null,
    coApproverRoleId: null,
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

  it("formats a days-based threshold without a dollar sign", () => {
    const points = deriveControlPoints(
      [row({ unit: "DAYS", coApprovalAboveThreshold: 3, coApproverRoleId: "finance-manager" })],
      roleNameById
    );
    expect(points[0]!.statement).toContain("above 3 days");
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

describe("buildProcessReportPrompt", () => {
  it("includes the process identity and task rows", () => {
    const prompt = buildProcessReportPrompt({
      workspaceName: "Acme Industrial",
      workspaceIndustry: "Manufacturing",
      processCode: "PUR101",
      processName: "Purchase-to-Pay",
      processDescription: null,
      rows: [
        { rowId: "a1", label: "Create PO", raciSummary: "AP Clerk=RESPONSIBLE", authoritySummary: "up to $10,000 — AP Clerk" },
      ],
    });
    expect(prompt).toContain("PUR101");
    expect(prompt).toContain("Purchase-to-Pay");
    expect(prompt).toContain("Create PO");
    expect(prompt).toContain("up to $10,000 — AP Clerk");
  });

  it("handles a process with no task rows", () => {
    const prompt = buildProcessReportPrompt({
      workspaceName: "Acme Industrial",
      workspaceIndustry: null,
      processCode: "PUR101",
      processName: "Purchase-to-Pay",
      processDescription: null,
      rows: [],
    });
    expect(prompt).toContain("No tasks yet.");
    expect(prompt).toContain("Industry / sector: not specified");
  });
});
