import { describe, it, expect } from "vitest";
import {
  buildAuthorityTableRows,
  validateAuthorityTable,
  deriveRowSummary,
  describeAuthorityRule,
  describeAuthorityRow,
  requiresApproval,
  gateLine,
  type TableStep,
  type TableActivity,
  type AuthorityAssignmentData,
  type AuthorityRuleData,
} from "@/lib/domain/authority-table";

let seq = 0;
function rule(overrides: Partial<AuthorityRuleData> = {}): AuthorityRuleData {
  return {
    id: `rule-${++seq}`,
    order: 0,
    measure: "MONEY",
    amount: null,
    days: null,
    direction: "GREATER_THAN",
    consequence: "APPROVAL",
    whoRoleId: null,
    whoPersonId: null,
    ...overrides,
  };
}

function money(amount: number, overrides: Partial<AuthorityRuleData> = {}): AuthorityRuleData {
  return rule({ measure: "MONEY", amount, ...overrides });
}

function time(days: number, overrides: Partial<AuthorityRuleData> = {}): AuthorityRuleData {
  return rule({ measure: "TIME", days, consequence: "ESCALATION", ...overrides });
}

function assignment(overrides: Partial<AuthorityAssignmentData> = {}): AuthorityAssignmentData {
  return { activityId: null, stepId: null, skipped: false, rules: [], ...overrides };
}

/**
 * The read model's whole point: nineteen files want one fact from a task —
 * "what figure does this decision gate on?" — not the rule list. This is the
 * single place that answers them, so it is the place a wrong answer would
 * spread from.
 */
describe("deriveRowSummary", () => {
  it("has nothing to say about a task with no rules", () => {
    expect(deriveRowSummary([])).toEqual({
      threshold: null,
      direction: "GREATER_THAN",
      slaDays: null,
      approverRoleId: null,
      approverPersonId: null,
      escalationRoleId: null,
    });
  });

  it("takes the threshold and direction from the first money rule", () => {
    const summary = deriveRowSummary([
      time(3),
      money(10000, { direction: "GREATER_OR_EQUAL" }),
      money(50000, { direction: "LESS_THAN" }),
    ]);
    expect(summary.threshold).toBe(10000);
    expect(summary.direction).toBe("GREATER_OR_EQUAL");
  });

  it("takes the turnaround from the first time rule", () => {
    expect(deriveRowSummary([money(10000), time(2), time(9)]).slaDays).toBe(2);
  });

  it("takes the approver from the first approval rule and the escalation owner from the first escalation rule", () => {
    const summary = deriveRowSummary([
      money(10000, { consequence: "APPROVAL", whoRoleId: "role-ap" }),
      money(50000, { consequence: "APPROVAL", whoRoleId: "role-controller" }),
      time(2, { consequence: "ESCALATION", whoRoleId: "role-procurement" }),
    ]);
    expect(summary.approverRoleId).toBe("role-ap");
    expect(summary.escalationRoleId).toBe("role-procurement");
  });

  it("carries a named person as the approver when the rule names one instead of a role", () => {
    const summary = deriveRowSummary([money(10000, { whoPersonId: "person-1" })]);
    expect(summary.approverPersonId).toBe("person-1");
    expect(summary.approverRoleId).toBeNull();
  });

  it("reports the direction of a no-rule task so the row still renders dimmed", () => {
    const summary = deriveRowSummary([rule({ measure: "NONE", direction: "EQUAL_NO_APPROVAL" })]);
    expect(summary.direction).toBe("EQUAL_NO_APPROVAL");
    expect(requiresApproval(summary.direction)).toBe(false);
    expect(summary.threshold).toBeNull();
  });

  it("leaves the gate line resolvable for a decision step that also carries time rules", () => {
    const summary = deriveRowSummary([time(3), money(100000, { direction: "GREATER_OR_EQUAL" })]);
    expect(gateLine(summary.threshold, summary.direction)).toBe("At or above $100,000");
  });

  it("draws no gate line for a step whose only rules are about time", () => {
    const summary = deriveRowSummary([time(3), time(5)]);
    expect(gateLine(summary.threshold, summary.direction)).toBeNull();
  });
});

describe("describeAuthorityRule", () => {
  it("states a money rule that needs a named approver", () => {
    expect(describeAuthorityRule(money(10000, { whoRoleId: "r" }), "AP Clerk")).toBe(
      "More than $10,000 needs approval from AP Clerk."
    );
  });

  it("states a money rule whose approver is not chosen yet", () => {
    expect(describeAuthorityRule(money(10000), null)).toBe("More than $10,000 needs approval.");
  });

  it("states a time rule that escalates", () => {
    expect(describeAuthorityRule(time(2, { whoRoleId: "r" }), "Procurement Lead")).toBe(
      "More than 2 days without a decision escalates to Procurement Lead."
    );
  });

  it("states a time rule that needs approval rather than escalating", () => {
    expect(describeAuthorityRule(time(2, { consequence: "APPROVAL" }), "Controller")).toBe(
      "More than 2 days needs approval from Controller."
    );
  });

  it("says so plainly when a rule escalates to nobody", () => {
    expect(describeAuthorityRule(time(5), null)).toBe(
      "More than 5 days without a decision escalates, but nobody is assigned."
    );
  });

  it("keeps the singular day", () => {
    expect(describeAuthorityRule(time(1, { whoRoleId: "r" }), "Controller")).toBe(
      "More than 1 day without a decision escalates to Controller."
    );
  });

  it("honours the direction wording", () => {
    expect(describeAuthorityRule(money(100000, { direction: "GREATER_OR_EQUAL" }), "Finance Manager")).toBe(
      "At or above $100,000 needs approval from Finance Manager."
    );
    expect(describeAuthorityRule(money(500, { direction: "LESS_THAN" }), "AP Clerk")).toBe(
      "Below $500 needs approval from AP Clerk."
    );
  });

  it("states a task that deliberately has no rule", () => {
    expect(describeAuthorityRule(rule({ measure: "NONE", direction: "EQUAL_NO_APPROVAL" }), null)).toBe(
      "No approval required — this step proceeds on its own."
    );
  });

  it("drops the figure clause rather than printing a half-sentence when the figure is missing", () => {
    expect(describeAuthorityRule(rule({ measure: "MONEY", amount: null }), "AP Clerk")).toBe(
      "Needs approval from AP Clerk."
    );
  });
});

describe("describeAuthorityRow", () => {
  const nameFor = (r: AuthorityRuleData) => (r.whoRoleId === "role-ap" ? "AP Clerk" : r.whoRoleId ? "Procurement Lead" : null);

  it("gives one sentence per rule, in the task's rule order", () => {
    const row = buildAuthorityTableRows(
      [{ id: "s1", type: "TASK", label: "Create Purchase Order" }],
      [],
      [
        assignment({
          stepId: "s1",
          rules: [
            money(10000, { order: 0, whoRoleId: "role-ap" }),
            time(2, { order: 1, whoRoleId: "role-proc" }),
          ],
        }),
      ]
    )[0]!;

    expect(describeAuthorityRow(row, nameFor)).toEqual([
      "More than $10,000 needs approval from AP Clerk.",
      "More than 2 days without a decision escalates to Procurement Lead.",
    ]);
  });

  it("says nothing at all about a task with no rules", () => {
    const row = buildAuthorityTableRows([{ id: "s1", type: "TASK", label: "Send PO" }], [], [])[0]!;
    expect(describeAuthorityRow(row, nameFor)).toEqual([]);
  });
});

describe("buildAuthorityTableRows", () => {
  const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create Purchase Order" }];

  it("shows a step with no assignment as an empty, unskipped row carrying no rules", () => {
    const rows = buildAuthorityTableRows(steps, [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "s1", kind: "step", skipped: false, rules: [] });
  });

  it("attaches a step's rules and derives its summary from them", () => {
    const rows = buildAuthorityTableRows(steps, [], [
      assignment({ stepId: "s1", rules: [money(10000, { whoRoleId: "role-ap" })] }),
    ]);
    expect(rows[0]!.rules).toHaveLength(1);
    expect(rows[0]!.threshold).toBe(10000);
    expect(rows[0]!.approverRoleId).toBe("role-ap");
  });

  it("sorts a task's rules by order, so the display order is the same on every load", () => {
    const rows = buildAuthorityTableRows(steps, [], [
      assignment({
        stepId: "s1",
        rules: [time(2, { order: 2 }), money(10000, { order: 0 }), money(50000, { order: 1 })],
      }),
    ]);
    expect(rows[0]!.rules.map((r) => r.order)).toEqual([0, 1, 2]);
    expect(rows[0]!.threshold).toBe(10000);
  });

  it("gives an Activity its own row, as the RACI table does", () => {
    const activities: TableActivity[] = [
      { id: "a1", name: "Draft the PO", relatedStepId: "s1", order: 0 },
    ];
    const rows = buildAuthorityTableRows(steps, activities, [
      assignment({ activityId: "a1", rules: [money(500)] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a1", kind: "activity", stepId: "s1" });
    expect(rows[0]!.threshold).toBe(500);
  });

  it("carries the skipped flag from the task, not from any rule", () => {
    const rows = buildAuthorityTableRows(steps, [], [assignment({ stepId: "s1", skipped: true })]);
    expect(rows[0]!.skipped).toBe(true);
  });

  it("returns nothing for a process with no steps and no activities", () => {
    expect(buildAuthorityTableRows([], [], [])).toEqual([]);
  });
});

describe("validateAuthorityTable", () => {
  const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Create Purchase Order" }];
  const rowsFor = (a: AuthorityAssignmentData[]) => buildAuthorityTableRows(steps, [], a);

  it("flags a task that has no rules at all", () => {
    expect(validateAuthorityTable(rowsFor([]))).toEqual([{ rowId: "s1", type: "MISSING_APPROVER" }]);
  });

  it("says nothing about a skipped task", () => {
    expect(validateAuthorityTable(rowsFor([assignment({ stepId: "s1", skipped: true })]))).toEqual([]);
  });

  it("says nothing about a task that deliberately needs no approval", () => {
    const rows = rowsFor([
      assignment({ stepId: "s1", rules: [rule({ measure: "NONE", direction: "EQUAL_NO_APPROVAL" })] }),
    ]);
    expect(validateAuthorityTable(rows)).toEqual([]);
  });

  it("flags a rule that names a consequence but nobody to carry it", () => {
    const incomplete = money(10000, { id: "r-1" });
    const rows = rowsFor([assignment({ stepId: "s1", rules: [incomplete] })]);
    expect(validateAuthorityTable(rows)).toEqual([
      { rowId: "s1", ruleId: "r-1", type: "INCOMPLETE_RULE_WHO" },
    ]);
  });

  it("flags a money rule with no amount and a time rule with no days", () => {
    const rows = rowsFor([
      assignment({
        stepId: "s1",
        rules: [
          rule({ id: "r-money", measure: "MONEY", amount: null, whoRoleId: "role-ap" }),
          rule({ id: "r-time", measure: "TIME", days: null, whoRoleId: "role-ap" }),
        ],
      }),
    ]);
    expect(validateAuthorityTable(rows)).toEqual([
      { rowId: "s1", ruleId: "r-money", type: "INCOMPLETE_RULE_FIGURE" },
      { rowId: "s1", ruleId: "r-time", type: "INCOMPLETE_RULE_FIGURE" },
    ]);
  });

  it("is satisfied by a complete rule", () => {
    const rows = rowsFor([assignment({ stepId: "s1", rules: [money(10000, { whoRoleId: "role-ap" })] })]);
    expect(validateAuthorityTable(rows)).toEqual([]);
  });

  it("no longer has a co-approver to complain about", () => {
    const rows = rowsFor([
      assignment({
        stepId: "s1",
        rules: [
          money(10000, { whoRoleId: "role-ap" }),
          money(50000, { whoRoleId: "role-controller" }),
        ],
      }),
    ]);
    expect(validateAuthorityTable(rows)).toEqual([]);
  });
});
