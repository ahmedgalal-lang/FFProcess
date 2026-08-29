/**
 * Builds the "process documentation" report structure: a single combined
 * RACI + Authority matrix per task (instead of two separate tables), the
 * governance Control Points derivable straight from real co-approval data,
 * and the list of what's still undocumented for a process. Pure and
 * framework-free (Constitution Principle III).
 */

import type { RaciCode, StepType } from "./raci-table";
import { formatMoney, type AuthorityDirection } from "./authority-table";

export type CombinedMatrixRow = {
  rowId: string;
  label: string;
  stepType: StepType | null;
  skipped: boolean;
  raciAssignments: Record<string, RaciCode>;
  slaDays: number | null;
  threshold: number | null;
  direction: AuthorityDirection;
  approverRoleId: string | null;
  approverPersonId: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverRoleId: string | null;
  escalationRoleId: string | null;
};

type RaciRowInput = {
  id: string;
  label: string;
  stepType: StepType | null;
  skipped: boolean;
  assignments: Record<string, RaciCode>;
};

type AuthorityRowInput = {
  id: string;
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

/**
 * Joins the RACI table's rows and the Authority table's rows by id — both
 * are built from the same Process Map steps + Activities (see
 * buildRaciTableRows / buildAuthorityTableRows), so they share row ids and
 * order. A row is left out of the combined matrix if either side marked it
 * skipped: the combined view is a governance document, so a task someone
 * has explicitly said doesn't need RACI or doesn't need Authority treatment
 * doesn't belong in it.
 */
export function buildCombinedMatrixRows(
  raciRows: RaciRowInput[],
  authorityRows: AuthorityRowInput[]
): CombinedMatrixRow[] {
  const authorityById = new Map(authorityRows.map((r) => [r.id, r]));

  return raciRows
    .map((raci) => {
      const authority = authorityById.get(raci.id);
      return {
        rowId: raci.id,
        label: raci.label,
        stepType: raci.stepType,
        skipped: raci.skipped || (authority?.skipped ?? false),
        raciAssignments: raci.assignments,
        slaDays: authority?.slaDays ?? null,
        threshold: authority?.threshold ?? null,
        direction: authority?.direction ?? "GREATER_THAN",
        approverRoleId: authority?.approverRoleId ?? null,
        approverPersonId: authority?.approverPersonId ?? null,
        coApprovalAboveThreshold: authority?.coApprovalAboveThreshold ?? null,
        coApproverRoleId: authority?.coApproverRoleId ?? null,
        escalationRoleId: authority?.escalationRoleId ?? null,
      };
    })
    .filter((row) => !row.skipped);
}

export type ControlPoint = {
  rowId: string;
  statement: string;
  flagged: boolean; // true when a co-approval threshold is set but no co-approver is assigned
};

/**
 * Derives Key Control Points straight from real co-approval rules already in
 * the Authority Matrix — not invented. A row with a co-approval threshold
 * becomes a "dual authorization" control statement; one with a threshold but
 * no co-approver assigned yet is flagged as a real gap rather than silently
 * described as though it were resolved.
 */
export function deriveControlPoints(
  rows: CombinedMatrixRow[],
  roleNameById: Map<string, string>
): ControlPoint[] {
  const points: ControlPoint[] = [];
  for (const row of rows) {
    if (row.coApprovalAboveThreshold === null) continue;
    const limit = formatMoney(row.coApprovalAboveThreshold);
    const coApprover = row.coApproverRoleId ? roleNameById.get(row.coApproverRoleId) : null;
    if (coApprover) {
      points.push({
        rowId: row.rowId,
        statement: `"${row.label}" above ${limit} requires separate sign-off from ${coApprover} in addition to the primary approver.`,
        flagged: false,
      });
    } else {
      points.push({
        rowId: row.rowId,
        statement: `"${row.label}" has a co-approval threshold of ${limit} set, but no co-approver is assigned — this needs to be resolved in the Authority Matrix.`,
        flagged: true,
      });
    }
  }
  return points;
}

/** Every roleId that appears anywhere in the combined matrix — as a RACI assignee, approver, or co-approver. */
export function involvedRoleIds(rows: CombinedMatrixRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const roleId of Object.keys(row.raciAssignments)) ids.add(roleId);
    if (row.approverRoleId) ids.add(row.approverRoleId);
    if (row.coApproverRoleId) ids.add(row.coApproverRoleId);
    if (row.escalationRoleId) ids.add(row.escalationRoleId);
  }
  return [...ids];
}

/** One duty a Role can hold in a process, and the tasks it holds it for. */
export type RoleDuty = {
  key: "accountable" | "responsible" | "consulted" | "informed" | "approves" | "coApproves" | "escalationFor";
  label: string;
  tasks: string[];
};

export type RoleDuties = {
  /** Only the duties this Role actually holds — an empty one is left out rather than rendered as "none". */
  duties: RoleDuty[];
};

const DUTY_ORDER: { key: RoleDuty["key"]; label: string; pick: (r: CombinedMatrixRow, roleId: string) => boolean }[] = [
  { key: "accountable", label: "Accountable", pick: (r, id) => r.raciAssignments[id] === "ACCOUNTABLE" },
  { key: "responsible", label: "Responsible", pick: (r, id) => r.raciAssignments[id] === "RESPONSIBLE" },
  { key: "consulted", label: "Consulted", pick: (r, id) => r.raciAssignments[id] === "CONSULTED" },
  { key: "informed", label: "Informed", pick: (r, id) => r.raciAssignments[id] === "INFORMED" },
  { key: "approves", label: "Approves", pick: (r, id) => r.approverRoleId === id },
  { key: "coApproves", label: "Co-approves", pick: (r, id) => r.coApproverRoleId === id },
  { key: "escalationFor", label: "Escalation point", pick: (r, id) => r.escalationRoleId === id },
];

/**
 * Breaks one Role's involvement into its separate duties, each with the tasks
 * it covers — the Export Report groups these under the Role rather than
 * running them together into a single sentence, which became unreadable once
 * a real process had more than a handful of tasks.
 */
export function deriveRoleDuties(rows: CombinedMatrixRow[], roleId: string): RoleDuties {
  const duties: RoleDuty[] = [];
  for (const { key, label, pick } of DUTY_ORDER) {
    const tasks = rows.filter((r) => pick(r, roleId)).map((r) => r.label);
    if (tasks.length > 0) duties.push({ key, label, tasks });
  }
  return { duties };
}

/**
 * The Role most often Accountable across the process's tasks — used as the
 * document's default "Process Owner" field. Falls back to the Role approving
 * the most tasks (Authority) when nobody holds Accountable anywhere, and to
 * null when the process has no RACI or Authority data at all yet.
 */
export function deriveProcessOwnerRoleId(rows: CombinedMatrixRow[]): string | null {
  const accountableCounts = new Map<string, number>();
  for (const row of rows) {
    for (const [roleId, code] of Object.entries(row.raciAssignments)) {
      if (code !== "ACCOUNTABLE") continue;
      accountableCounts.set(roleId, (accountableCounts.get(roleId) ?? 0) + 1);
    }
  }
  const topAccountable = [...accountableCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAccountable) return topAccountable[0];

  const approverCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.approverRoleId) continue;
    approverCounts.set(row.approverRoleId, (approverCounts.get(row.approverRoleId) ?? 0) + 1);
  }
  const topApprover = [...approverCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return topApprover?.[0] ?? null;
}

export type DocumentationGapsInput = {
  processPurpose: string | null;
  inScope: string[];
  outOfScope: string[];
  externalEntities: { name: string; description: string }[];
  steps: { detailedAction: string[]; exceptionHandling: string | null }[];
  kpis: { metric: string; target: string; frequency: string }[];
};

/**
 * What's still undocumented for this process's Export Report, in plain
 * language — surfaced as a preview-only banner (never printed) so a
 * consultant knows what to fill in before exporting, instead of the report
 * silently omitting sections with no content.
 */
export function deriveDocumentationGaps(input: DocumentationGapsInput): string[] {
  const gaps: string[] = [];
  if (!input.processPurpose?.trim()) gaps.push("Process Purpose not written");
  if (input.inScope.length === 0 && input.outOfScope.length === 0) {
    gaps.push("Scope (In-Scope / Out-of-Scope) not documented");
  }
  if (input.externalEntities.length === 0) gaps.push("No External Entities documented");

  const undocumentedSteps = input.steps.filter(
    (s) => s.detailedAction.length === 0 && !s.exceptionHandling?.trim()
  );
  if (undocumentedSteps.length > 0) {
    gaps.push(
      `${undocumentedSteps.length} of ${input.steps.length} step(s) missing Detailed Action / Exception Handling`
    );
  }

  if (input.kpis.length === 0) gaps.push("No KPIs added");

  return gaps;
}
