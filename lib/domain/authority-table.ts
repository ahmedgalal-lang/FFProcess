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

export type AuthorityAssignmentData = {
  activityId: string | null;
  stepId: string | null;
  skipped: boolean;
  slaDays: number | null;
  threshold: number | null;
  direction: AuthorityDirection;
  approverRoleId: string | null;
  approverPersonId: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverRoleId: string | null;
  escalationRoleId: string | null;
};

export type AuthorityTableRow = {
  id: string; // the Activity's id if one exists for this row, otherwise the Step's id
  kind: "activity" | "step";
  stepId: string | null;
  stepType: StepType | null;
  label: string;
  skipped: boolean;
  slaDays: number | null;
  threshold: number | null;
  direction: AuthorityDirection;
  approverRoleId: string | null;
  approverPersonId: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverRoleId: string | null;
  escalationRoleId: string | null;
};

const EMPTY_DATA: Omit<AuthorityAssignmentData, "activityId" | "stepId"> = {
  skipped: false,
  slaDays: null,
  threshold: null,
  direction: "GREATER_THAN",
  approverRoleId: null,
  approverPersonId: null,
  coApprovalAboveThreshold: null,
  coApproverRoleId: null,
  escalationRoleId: null,
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
    return {
      id,
      kind,
      stepId,
      stepType,
      label,
      skipped: data.skipped,
      slaDays: data.slaDays,
      threshold: data.threshold,
      direction: data.direction,
      approverRoleId: data.approverRoleId,
      approverPersonId: data.approverPersonId,
      coApprovalAboveThreshold: data.coApprovalAboveThreshold,
      coApproverRoleId: data.coApproverRoleId,
      escalationRoleId: data.escalationRoleId,
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

export function formatSla(days: number | null): string {
  if (days === null) return "—";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export type AuthorityRuleNames = {
  approver: string | null;
  coApprover: string | null;
  escalation: string | null;
};

/**
 * States a row's rule as one plain sentence — the same wording the Authority
 * Matrix shows under each row and the Export Report prints. Written here
 * rather than in the component so both surfaces say exactly the same thing.
 */
export function describeAuthorityRule(row: AuthorityTableRow, names: AuthorityRuleNames): string {
  const sla = row.slaDays === null ? null : formatSla(row.slaDays);

  if (!requiresApproval(row.direction)) {
    const base = "No approval required — this step proceeds on its own.";
    return sla ? `${base} Turnaround expectation: within ${sla}.` : base;
  }

  const parts: string[] = [];
  const amount = row.threshold === null ? null : formatMoney(row.threshold);
  const phrase = DIRECTION_LABELS[row.direction].phrase;

  if (amount && names.approver) {
    parts.push(`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} ${amount} needs approval from ${names.approver}`);
  } else if (amount) {
    parts.push(`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} ${amount} needs approval`);
  } else if (names.approver) {
    parts.push(`Needs approval from ${names.approver}`);
  } else {
    parts.push("Needs approval");
  }

  if (sla) parts.push(`within ${sla}`);

  let sentence = `${parts.join(", ")}.`;

  if (row.coApprovalAboveThreshold !== null) {
    const coAmount = formatMoney(row.coApprovalAboveThreshold);
    sentence += names.coApprover
      ? ` A second sign-off from ${names.coApprover} is required above ${coAmount}.`
      : ` Co-approval is required above ${coAmount}, but no co-approver is assigned.`;
  }

  if (names.escalation) {
    sentence += sla
      ? ` If ${sla} pass with no decision, it escalates to ${names.escalation}.`
      : ` Unresolved, it escalates to ${names.escalation}.`;
  }

  return sentence;
}

export type AuthorityIssue =
  | { rowId: string; type: "MISSING_APPROVER" }
  | { rowId: string; type: "MISSING_CO_APPROVER" };

/**
 * Mirrors RACI's rule (validateRaciMatrix): every non-skipped row must be
 * complete. Here that means an approver assigned, and — if a co-approval
 * threshold is set — a co-approver assigned too. A row marked
 * EQUAL_NO_APPROVAL is exempt: it deliberately has no approval gate, so
 * demanding an approver for it would be a false alarm.
 */
export function validateAuthorityTable(rows: AuthorityTableRow[]): AuthorityIssue[] {
  const issues: AuthorityIssue[] = [];
  for (const row of rows) {
    if (row.skipped) continue;
    if (!requiresApproval(row.direction)) continue;

    if (row.approverRoleId === null && row.approverPersonId === null) {
      issues.push({ rowId: row.id, type: "MISSING_APPROVER" });
    }
    if (row.coApprovalAboveThreshold !== null && row.coApproverRoleId === null) {
      issues.push({ rowId: row.id, type: "MISSING_CO_APPROVER" });
    }
  }
  return issues;
}
