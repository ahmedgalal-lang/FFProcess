/**
 * Builds the unified RACI table's rows, in Process Map order: a step with
 * one or more linked Activities becomes one row per Activity (a step can be
 * split into several finer-grained RACI lines); a step with none becomes a
 * single empty, assignable row of its own. Any freestanding Activity that
 * isn't tied to a step at all is appended after. Pure and framework-free
 * (Constitution Principle III).
 */

export type RaciCode = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
export type StepType = "START" | "TASK" | "DECISION" | "END";

export type TableStep = { id: string; type: StepType; label: string; raciSkipped: boolean };
export type TableActivity = {
  id: string;
  name: string;
  relatedStepId: string | null;
  order: number;
  assignments: { roleId: string; code: RaciCode }[];
};

export type RaciTableRow = {
  id: string; // the Activity's id if one exists for this row, otherwise the Step's id
  kind: "activity" | "step"; // "step" rows (skippable, empty) are the only ones with no Activity yet
  stepId: string | null; // the Process Map step this row came from, if any (set for both kinds)
  stepType: StepType | null;
  label: string;
  skipped: boolean;
  assignments: Record<string, RaciCode>;
};

export function buildRaciTableRows(steps: TableStep[], activities: TableActivity[]): RaciTableRow[] {
  // A step can have more than one Activity linked to it (e.g. one Process
  // Map step split into several finer-grained RACI lines) — keep all of
  // them, not just the last one seen.
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

  function toRow(activity: TableActivity, step: TableStep | null): RaciTableRow {
    return {
      id: activity.id,
      kind: "activity",
      stepId: step?.id ?? null,
      stepType: step?.type ?? null,
      label: activity.name,
      skipped: false,
      assignments: Object.fromEntries(activity.assignments.map((a) => [a.roleId, a.code])),
    };
  }

  const stepRows: RaciTableRow[] = steps.flatMap((step) => {
    const linked = activitiesByStepId.get(step.id);
    if (linked && linked.length > 0) {
      return [...linked].sort((a, b) => a.order - b.order).map((activity) => toRow(activity, step));
    }
    return [
      {
        id: step.id,
        kind: "step" as const,
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        skipped: step.raciSkipped,
        assignments: {},
      },
    ];
  });

  const freestandingRows: RaciTableRow[] = freestanding
    .sort((a, b) => a.order - b.order)
    .map((activity) => toRow(activity, null));

  return [...stepRows, ...freestandingRows];
}

/**
 * Which Role columns the RACI table should actually show. A workspace can
 * have far more Roles than any single process needs (e.g. every section head
 * across a whole plant), so the table defaults to only the Roles already in
 * use here — anything with at least one RACI assignment among these rows —
 * plus whatever's been explicitly pinned via "+ Add title" (pinnedRoleIds,
 * Process.raciVisibleRoleIds), even before it has an assignment yet. If
 * neither set has anything (a brand-new, never-touched matrix), falls back
 * to every workspace Role so the table is never columnless.
 */
export function computeVisibleRoleIds(
  allRoleIds: string[],
  rows: RaciTableRow[],
  pinnedRoleIds: string[]
): string[] {
  const usedRoleIds = new Set<string>();
  for (const row of rows) {
    for (const roleId of Object.keys(row.assignments)) usedRoleIds.add(roleId);
  }

  const visible = new Set([...usedRoleIds, ...pinnedRoleIds]);
  if (visible.size === 0) return allRoleIds;
  return allRoleIds.filter((id) => visible.has(id));
}
