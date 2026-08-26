/**
 * AI-review data shaping: deterministic structural checks over a Process Map,
 * plus assembling the prompt sent to Gemini. Pure and framework-free so the
 * checks and prompt shape are unit-testable without the database or the
 * Gemini SDK (Constitution Principle III).
 */

import type { RaciIssue } from "./raci-validation";
import type { AuthorityIssue, AuthorityUnit } from "./authority-table";

export type StepType = "START" | "TASK" | "DECISION" | "END";

export type ReviewStep = { id: string; type: StepType; label: string };
export type ReviewConnection = { fromStepId: string; toStepId: string };

export type StructuralGap =
  | { type: "MISSING_START" }
  | { type: "MISSING_END" }
  | { type: "ISOLATED_STEP"; stepId: string; label: string }
  | { type: "DECISION_SINGLE_BRANCH"; stepId: string; label: string };

/**
 * Flags mechanical Process Map gaps that don't need an LLM to find: no START,
 * no END, a step with no connections at all, or a DECISION step that only
 * ever branches one way (so the decision has no observable effect).
 */
export function findStructuralGaps(steps: ReviewStep[], connections: ReviewConnection[]): StructuralGap[] {
  const gaps: StructuralGap[] = [];
  if (steps.length === 0) return gaps;

  if (!steps.some((s) => s.type === "START")) gaps.push({ type: "MISSING_START" });
  if (!steps.some((s) => s.type === "END")) gaps.push({ type: "MISSING_END" });

  const connectedStepIds = new Set<string>();
  const outgoingCountByStep = new Map<string, number>();
  for (const conn of connections) {
    connectedStepIds.add(conn.fromStepId);
    connectedStepIds.add(conn.toStepId);
    outgoingCountByStep.set(conn.fromStepId, (outgoingCountByStep.get(conn.fromStepId) ?? 0) + 1);
  }

  for (const step of steps) {
    if (steps.length > 1 && !connectedStepIds.has(step.id)) {
      gaps.push({ type: "ISOLATED_STEP", stepId: step.id, label: step.label });
    }
    if (step.type === "DECISION" && (outgoingCountByStep.get(step.id) ?? 0) === 1) {
      gaps.push({ type: "DECISION_SINGLE_BRANCH", stepId: step.id, label: step.label });
    }
  }

  return gaps;
}

function describeStructuralGap(gap: StructuralGap): string {
  switch (gap.type) {
    case "MISSING_START":
      return "The map has no START step.";
    case "MISSING_END":
      return "The map has no END step.";
    case "ISOLATED_STEP":
      return `Step "${gap.label}" has no incoming or outgoing connections.`;
    case "DECISION_SINGLE_BRANCH":
      return `Decision step "${gap.label}" only has one outgoing branch — a decision with a single outcome isn't a decision.`;
  }
}

function describeRaciIssue(issue: RaciIssue, activityNameById: Map<string, string>): string {
  const name = activityNameById.get(issue.activityId) ?? issue.activityId;
  switch (issue.type) {
    case "MISSING_ACCOUNTABLE":
      return `Activity "${name}" has no Accountable role.`;
    case "MULTIPLE_ACCOUNTABLE":
      return `Activity "${name}" has more than one Accountable role.`;
    case "MISSING_RESPONSIBLE":
      return `Activity "${name}" has no Responsible role.`;
  }
}

export type ProcessReviewContext = {
  workspaceName: string;
  workspaceIndustry: string | null;
  processCode: string;
  processName: string;
  processDescription: string | null;
  steps: {
    type: StepType;
    label: string;
    assignedRoleName: string | null;
    swimlaneRoleName: string | null;
    linkedProcessCodes: string[];
  }[];
  connections: { fromLabel: string; toLabel: string; connectionLabel: string | null }[];
  raci: {
    matrixStatus: "DRAFT" | "FINAL";
    activities: { id: string; name: string; assignments: { roleName: string; code: string }[] }[];
    issues: RaciIssue[];
  };
  authority: {
    rows: {
      rowId: string;
      label: string;
      skipped: boolean;
      unit: AuthorityUnit;
      threshold: number | null;
      approverLabel: string | null;
      coApprovalAboveThreshold: number | null;
      coApproverLabel: string | null;
    }[];
    issues: AuthorityIssue[];
  };
  structuralGaps: StructuralGap[];
};

/**
 * Renders the full context into the user-turn text sent to Gemini. Kept as a
 * pure string builder (no network call) so its shape is unit-testable.
 */
export function buildProcessReviewPrompt(context: ProcessReviewContext): string {
  const activityNameById = new Map<string, string>();
  const lines: string[] = [];

  lines.push(`# Process: ${context.processCode} — ${context.processName}`);
  lines.push(`Workspace: ${context.workspaceName}`);
  lines.push(`Industry / sector: ${context.workspaceIndustry ?? "not specified"}`);
  if (context.processDescription) lines.push(`Description: ${context.processDescription}`);
  lines.push("");

  lines.push("## Process Map");
  if (context.steps.length === 0) {
    lines.push("(No steps have been added yet.)");
  } else {
    for (const step of context.steps) {
      const role = step.assignedRoleName ? ` [assigned: ${step.assignedRoleName}]` : "";
      const lane = step.swimlaneRoleName ? ` [swimlane: ${step.swimlaneRoleName}]` : "";
      const links = step.linkedProcessCodes.length
        ? ` [links to: ${step.linkedProcessCodes.join(", ")}]`
        : "";
      lines.push(`- (${step.type}) ${step.label}${role}${lane}${links}`);
    }
    lines.push("");
    lines.push("Connections:");
    if (context.connections.length === 0) {
      lines.push("(none)");
    } else {
      for (const c of context.connections) {
        const label = c.connectionLabel ? ` — "${c.connectionLabel}"` : "";
        lines.push(`- ${c.fromLabel} → ${c.toLabel}${label}`);
      }
    }
  }
  lines.push("");

  lines.push("## RACI Matrix");
  lines.push(`Status: ${context.raci.matrixStatus}`);
  if (context.raci.activities.length === 0) {
    lines.push("(No activities have been added yet.)");
  } else {
    for (const activity of context.raci.activities) {
      activityNameById.set(activity.id, activity.name);
      const assignments = activity.assignments.length
        ? activity.assignments.map((a) => `${a.roleName}=${a.code}`).join(", ")
        : "(no assignments)";
      lines.push(`- ${activity.name}: ${assignments}`);
    }
  }
  lines.push("");

  const authorityLabelByRowId = new Map<string, string>();
  lines.push("## Authority Matrix");
  const activeAuthorityRows = context.authority.rows.filter((r) => !r.skipped);
  if (activeAuthorityRows.length === 0) {
    lines.push("(No authority entries yet.)");
  } else {
    for (const row of activeAuthorityRows) {
      authorityLabelByRowId.set(row.rowId, row.label);
      const threshold =
        row.threshold === null
          ? "no threshold set"
          : row.unit === "MONEY"
            ? `up to $${row.threshold.toLocaleString()}`
            : `up to ${row.threshold} day(s)`;
      const approver = row.approverLabel ?? "no approver assigned";
      const co =
        row.coApproverLabel && row.coApprovalAboveThreshold !== null
          ? `, co-approval from ${row.coApproverLabel} above ${row.unit === "MONEY" ? `$${row.coApprovalAboveThreshold.toLocaleString()}` : `${row.coApprovalAboveThreshold} day(s)`}`
          : "";
      lines.push(`- ${row.label}: ${threshold} — ${approver}${co}`);
    }
  }
  lines.push("");

  const knownIssues = [
    ...context.structuralGaps.map(describeStructuralGap),
    ...context.raci.issues.map((i) => describeRaciIssue(i, activityNameById)),
    ...context.authority.issues.map((i) => {
      const label = authorityLabelByRowId.get(i.rowId) ?? i.rowId;
      return i.type === "MISSING_APPROVER"
        ? `Authority Matrix task "${label}" has no approver assigned.`
        : `Authority Matrix task "${label}" has a co-approval threshold but no co-approver assigned.`;
    }),
  ];
  lines.push("## Already-detected mechanical issues");
  lines.push(
    "These were found by validation rules, not by you — don't just restate them verbatim. Use them as a starting point and go deeper: look for gaps and risks a mechanical rule can't see (unclear ownership, missing escalation paths, steps with no role assigned, RACI/process-map inconsistencies, segregation-of-duties conflicts, single points of failure)."
  );
  lines.push(knownIssues.length > 0 ? knownIssues.map((l) => `- ${l}`).join("\n") : "(none)");

  return lines.join("\n");
}
