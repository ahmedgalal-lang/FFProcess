/**
 * Builds the Authority Matrix's rows — the exact same task list the RACI
 * table uses (see buildRaciTableRows in lib/domain/raci-table.ts): a step
 * with one or more linked Activities becomes one row per Activity, a step
 * with none becomes a single empty, assignable row, and any freestanding
 * Activity not tied to a step is appended after. Authority data (threshold,
 * approver, co-approval) is then merged in per row by matching id, same as
 * RACI matches assignments by activityId. Pure and framework-free
 * (Constitution Principle III).
 */

export type AuthorityDirection =
  | "GREATER_THAN"
  | "GREATER_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_OR_EQUAL"
  | "EQUAL_NO_APPROVAL";
export type StepType = "START" | "TASK" | "DECISION" | "END";

/** Short symbol + wording for each direction, used in the table and in prose. */
export const DIRECTION_LABELS: Record<AuthorityDirection, { symbol: string; label: string; phrase: string }> = {
  GREATER_THAN: { symbol: ">", label: "More than", phrase: "more than" },
  GREATER_OR_EQUAL: { symbol: "\u2265", label: "At or above", phrase: "at or above" },
  LESS_THAN: { symbol: "<", label: "Below", phrase: "below" },
  LESS_OR_EQUAL: { symbol: "\u2264", label: "At or below", phrase: "at or below" },
  EQUAL_NO_APPROVAL: { symbol: "=", label: "Equal \u2014 no approval", phrase: "no approval required" },
};

/** A step with this direction has no approval gate at all — it renders dimmed. */
export function requiresApproval(direction: AuthorityDirection): boolean {
  return direction !== "EQUAL_NO_APPROVAL";
}

export type TableStep = { id: string; type: StepType; label: string };
export type TableActivity = { id: string; name: string; relatedStepId: string | null; order: number };

export type AuthorityMeasure = "MONEY" | "TIME" | "NONE";
export type AuthorityConsequence = "APPROVAL" | "ESCALATION";

/**
 * One governance statement about one task: what it turns on, the figure,
 * which side of the figure it fires on, and who it lands on.
 *
 * A task carries an ordered list of these. That list is what replaced the old
 * fixed columns — a second signer is a second APPROVAL rule rather than a
 * special co-approval field, and a task with both a spending limit and a
 * turnaround is two rules rather than one row holding two unrelated rules.
 */
export type AuthorityRuleData = {
  id: string;
  order: number;
  measure: AuthorityMeasure;
  amount: number | null;
  days: number | null;
  direction: AuthorityDirection;
  consequence: AuthorityConsequence;
  whoRoleId: string | null;
  whoPersonId: string | null;
};

export type AuthorityAssignmentData = {
  activityId: string | null;
  stepId: string | null;
  skipped: boolean;
  rules: AuthorityRuleData[];
};

/**
 * The single answer to "one fact about this task".
 *
 * Nineteen files read authority data and most of them want one thing — the
 * figure a decision gates on, or whether a task still needs an approver — not
 * the rule list. Deriving those here once is what keeps the Process Map, the
 * printed diagram and the deck out of this feature's blast radius, and is the
 * same reasoning that centralised gateLine.
 */
export type AuthorityRowSummary = {
  threshold: number | null;
  direction: AuthorityDirection;
  slaDays: number | null;
  approverRoleId: string | null;
  approverPersonId: string | null;
  escalationRoleId: string | null;
};

export type AuthorityTableRow = AuthorityRowSummary & {
  id: string; // the Activity's id if one exists for this row, otherwise the Step's id
  kind: "activity" | "step";
  stepId: string | null;
  stepType: StepType | null;
  label: string;
  skipped: boolean;
  /** Every rule on this task, in display order. */
  rules: AuthorityRuleData[];
};

/**
 * The approval rules on a task beyond the first — the second and subsequent
 * signatures it needs.
 *
 * This is what the old "co-approval" field became. Stated once here so the
 * report's control points, the spreadsheet and the AI prompt all mean the same
 * thing by "a task that needs another sign-off".
 */
export function additionalApprovals(rules: AuthorityRuleData[]): AuthorityRuleData[] {
  return rules.filter((r) => r.consequence === "APPROVAL" && r.measure !== "NONE").slice(1);
}

export function deriveRowSummary(rules: AuthorityRuleData[]): AuthorityRowSummary {
  const firstMoney = rules.find((r) => r.measure === "MONEY");
  const firstTime = rules.find((r) => r.measure === "TIME");
  const firstApproval = rules.find((r) => r.consequence === "APPROVAL" && r.measure !== "NONE");
  const firstEscalation = rules.find((r) => r.consequence === "ESCALATION" && r.measure !== "NONE");

  // A NONE rule carries EQUAL_NO_APPROVAL, which is what dims the row — so it
  // has to win the direction even though it has no figure.
  const noRule = rules.find((r) => r.measure === "NONE");

  return {
    threshold: firstMoney?.amount ?? null,
    direction: noRule?.direction ?? firstMoney?.direction ?? rules[0]?.direction ?? "GREATER_THAN",
    slaDays: firstTime?.days ?? null,
    approverRoleId: firstApproval?.whoRoleId ?? null,
    approverPersonId: firstApproval?.whoPersonId ?? null,
    escalationRoleId: firstEscalation?.whoRoleId ?? null,
  };
}

const EMPTY_DATA: Omit<AuthorityAssignmentData, "activityId" | "stepId"> = {
  skipped: false,
  rules: [],
};

export function buildAuthorityTableRows(
  steps: TableStep[],
  activities: TableActivity[],
  assignments: AuthorityAssignmentData[]
): AuthorityTableRow[] {
  const assignmentByRowId = new Map<string, AuthorityAssignmentData>();
  for (const a of assignments) {
    const key = a.activityId ?? a.stepId;
    if (key) assignmentByRowId.set(key, a);
  }

  const activitiesByStepId = new Map<string, TableActivity[]>();
  const freestanding: TableActivity[] = [];
  for (const a of activities) {
    if (a.relatedStepId) {
      const list = activitiesByStepId.get(a.relatedStepId) ?? [];
      list.push(a);
      activitiesByStepId.set(a.relatedStepId, list);
    } else {
      freestanding.push(a);
    }
  }

  function toRow(
    id: string,
    kind: "activity" | "step",
    stepId: string | null,
    stepType: StepType | null,
    label: string
  ): AuthorityTableRow {
    const data = assignmentByRowId.get(id) ?? EMPTY_DATA;
    // Sorted here rather than trusted from the caller, so the display order is
    // the same however the rules were fetched.
    const rules = [...data.rules].sort((a, b) => a.order - b.order);
    return {
      id,
      kind,
      stepId,
      stepType,
      label,
      skipped: data.skipped,
      rules,
      ...deriveRowSummary(rules),
    };
  }

  const stepRows: AuthorityTableRow[] = steps.flatMap((step) => {
    const linked = activitiesByStepId.get(step.id);
    if (linked && linked.length > 0) {
      return [...linked]
        .sort((a, b) => a.order - b.order)
        .map((activity) => toRow(activity.id, "activity", step.id, step.type, activity.name));
    }
    return [toRow(step.id, "step", step.id, step.type, step.label)];
  });

  const freestandingRows: AuthorityTableRow[] = freestanding
    .sort((a, b) => a.order - b.order)
    .map((activity) => toRow(activity.id, "activity", null, null, activity.name));

  return [...stepRows, ...freestandingRows];
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString()}`;
}

/**
 * A decision step's approval gate, in plain words — "At or above $10,000".
 *
 * Shared by the live canvas, the print/PDF diagram and the PPTX so the three
 * cannot drift. It deliberately stops at the threshold: the branching is
 * already said twice over by the diamond the gate is drawn in and by the Yes
 * and No labels on the connectors leaving it, and a third copy inside the
 * shape only crowds out the number the reader is actually there for.
 */
export function gateLine(
  threshold: number | null | undefined,
  direction: AuthorityDirection | undefined
): string | null {
  if (threshold == null) return null;
  return `${DIRECTION_LABELS[direction ?? "GREATER_THAN"].label} ${formatMoney(threshold)}`;
}

export function formatSla(days: number | null): string {
  if (days === null) return "—";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * States one rule as one plain sentence — the same wording the Authority
 * Matrix shows under each rule and the Export Report, the deck and the
 * spreadsheet all print. Written here rather than in any component so the four
 * surfaces cannot say different things about the same rule.
 */
export function describeAuthorityRule(rule: AuthorityRuleData, whoName: string | null): string {
  if (rule.measure === "NONE" || !requiresApproval(rule.direction)) {
    return "No approval required — this step proceeds on its own.";
  }

  const tail =
    rule.consequence === "APPROVAL"
      ? whoName
        ? `needs approval from ${whoName}`
        : "needs approval"
      : whoName
        ? `escalates to ${whoName}`
        : "escalates, but nobody is assigned";

  const label = DIRECTION_LABELS[rule.direction].label;

  if (rule.measure === "MONEY") {
    // A figure that was never filled in prints as no clause at all rather than
    // as a half-sentence in a client pack. Validation reports it separately.
    if (rule.amount === null) return `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
    return `${label} ${formatMoney(rule.amount)} ${tail}.`;
  }

  if (rule.days === null) return `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
  const days = `${rule.days} day${rule.days === 1 ? "" : "s"}`;
  // "without a decision" only reads correctly on the escalation branch; a time
  // rule that demands approval is just a deadline for signing.
  const clause = rule.consequence === "ESCALATION" ? `${days} without a decision` : days;
  return `${label} ${clause} ${tail}.`;
}

/**
 * Every rule on a task, in the task's rule order. This is the array the
 * report, the deck and the spreadsheet print, so none of them can disagree
 * about what a task's rules are or what order they come in.
 */
export function describeAuthorityRow(
  row: AuthorityTableRow,
  whoNameFor: (rule: AuthorityRuleData) => string | null
): string[] {
  return row.rules.map((rule) => describeAuthorityRule(rule, whoNameFor(rule)));
}

export type AuthorityIssueType =
  | "MISSING_APPROVER"
  | "INCOMPLETE_RULE_WHO"
  | "INCOMPLETE_RULE_FIGURE";

export type AuthorityIssue = {
  rowId: string;
  /** Present when the issue is about one rule rather than the task as a whole. */
  ruleId?: string;
  type: AuthorityIssueType;
};

/**
 * Mirrors RACI's rule (validateRaciMatrix): every non-skipped task must be
 * complete. Here that means it has at least one rule, and every rule it has is
 * finished — a figure, and somebody to carry the consequence.
 *
 * A task whose rule says "no approval required" is exempt, the same exemption
 * EQUAL_NO_APPROVAL always had: demanding an approver for a task that
 * deliberately has no gate would be a false alarm. There is no co-approver to
 * check any more — a second signer is an ordinary second rule and is validated
 * like any other.
 */
export function validateAuthorityTable(rows: AuthorityTableRow[]): AuthorityIssue[] {
  const issues: AuthorityIssue[] = [];

  for (const row of rows) {
    if (row.skipped) continue;
    if (!requiresApproval(row.direction)) continue;

    if (row.rules.length === 0) {
      issues.push({ rowId: row.id, type: "MISSING_APPROVER" });
      continue;
    }

    for (const rule of row.rules) {
      if (rule.measure === "NONE") continue;

      const figureMissing = rule.measure === "MONEY" ? rule.amount === null : rule.days === null;
      if (figureMissing) {
        issues.push({ rowId: row.id, ruleId: rule.id, type: "INCOMPLETE_RULE_FIGURE" });
        continue;
      }

      if (rule.whoRoleId === null && rule.whoPersonId === null) {
        issues.push({ rowId: row.id, ruleId: rule.id, type: "INCOMPLETE_RULE_WHO" });
      }
    }
  }

  return issues;
}
