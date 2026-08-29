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

/**
 * Describes one Role's involvement in this process mechanically from its
 * real RACI codes and Authority approvals — no AI needed, since this is a
 * straightforward summary of data already on hand.
 */
export function describeRoleInvolvement(rows: CombinedMatrixRow[], roleId: string): string {
  const accountableFor = rows.filter((r) => r.raciAssignments[roleId] === "ACCOUNTABLE").map((r) => r.label);
  const responsibleFor = rows.filter((r) => r.raciAssignments[roleId] === "RESPONSIBLE").map((r) => r.label);
  const consultedOn = rows.filter((r) => r.raciAssignments[roleId] === "CONSULTED").map((r) => r.label);
  const approves = rows.filter((r) => r.approverRoleId === roleId).map((r) => r.label);
  const coApproves = rows.filter((r) => r.coApproverRoleId === roleId).map((r) => r.label);
  const escalations = rows.filter((r) => r.escalationRoleId === roleId).map((r) => r.label);

  const parts: string[] = [];
  if (accountableFor.length > 0) parts.push(`Accountable for ${accountableFor.join(", ")}`);
  if (responsibleFor.length > 0) parts.push(`Responsible for ${responsibleFor.join(", ")}`);
  if (consultedOn.length > 0) parts.push(`consulted on ${consultedOn.join(", ")}`);
  if (approves.length > 0) parts.push(`approves ${approves.join(", ")}`);
  if (coApproves.length > 0) parts.push(`co-approves ${coApproves.join(", ")}`);
  if (escalations.length > 0) parts.push(`is the escalation point for ${escalations.join(", ")}`);

  if (parts.length === 0) return "Involved in this process.";
  return `${parts[0]![0]!.toUpperCase()}${parts[0]!.slice(1)}${parts.length > 1 ? "; " + parts.slice(1).join("; ") : ""}.`;
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
