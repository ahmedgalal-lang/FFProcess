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

export type AuthorityUnit = "MONEY" | "DAYS";
export type StepType = "START" | "TASK" | "DECISION" | "END";

export type TableStep = { id: string; type: StepType; label: string };
export type TableActivity = { id: string; name: string; relatedStepId: string | null; order: number };

export type AuthorityAssignmentData = {
  activityId: string | null;
  stepId: string | null;
  skipped: boolean;
  unit: AuthorityUnit;
  threshold: number | null;
  approverRoleId: string | null;
  approverPersonId: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverRoleId: string | null;
};

export type AuthorityTableRow = {
  id: string; // the Activity's id if one exists for this row, otherwise the Step's id
  kind: "activity" | "step";
  stepId: string | null;
  stepType: StepType | null;
  label: string;
  skipped: boolean;
  unit: AuthorityUnit;
  threshold: number | null;
  approverRoleId: string | null;
  approverPersonId: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverRoleId: string | null;
};

const EMPTY_DATA: Omit<AuthorityAssignmentData, "activityId" | "stepId"> = {
  skipped: false,
  unit: "MONEY",
  threshold: null,
  approverRoleId: null,
  approverPersonId: null,
  coApprovalAboveThreshold: null,
  coApproverRoleId: null,
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
      unit: data.unit,
      threshold: data.threshold,
      approverRoleId: data.approverRoleId,
      approverPersonId: data.approverPersonId,
      coApprovalAboveThreshold: data.coApprovalAboveThreshold,
      coApproverRoleId: data.coApproverRoleId,
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

export type AuthorityIssue =
  | { rowId: string; type: "MISSING_APPROVER" }
  | { rowId: string; type: "MISSING_CO_APPROVER" };

/**
 * Mirrors RACI's rule (validateRaciMatrix): every non-skipped row must be
 * complete. Here that means an approver assigned, and — if a co-approval
 * threshold is set — a co-approver assigned too.
 */
export function validateAuthorityTable(rows: AuthorityTableRow[]): AuthorityIssue[] {
  const issues: AuthorityIssue[] = [];
  for (const row of rows) {
    if (row.skipped) continue;

    if (row.approverRoleId === null && row.approverPersonId === null) {
      issues.push({ rowId: row.id, type: "MISSING_APPROVER" });
    }
    if (row.coApprovalAboveThreshold !== null && row.coApproverRoleId === null) {
      issues.push({ rowId: row.id, type: "MISSING_CO_APPROVER" });
    }
  }
  return issues;
}
