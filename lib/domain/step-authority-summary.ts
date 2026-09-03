/**
 * The Process Map diagram's read of Authority data — just enough of it
 * (SLA target, approval threshold, direction) to put on a step's card,
 * looked up by the step itself rather than by row id.
 *
 * buildAuthorityTableRows (see authority-table.ts) returns one row per
 * Activity, and a row's own `id` is the Activity's id when a step has one —
 * only falling back to the step's id when it doesn't. A lookup keyed by that
 * `id` therefore silently misses SLA/threshold data for any step that has a
 * related Activity, which is the common case. Each row also carries its own
 * `stepId` field precisely to avoid this ambiguity, so this builder indexes
 * by that instead. Pure and framework-free (Constitution Principle III).
 */

import {
  buildAuthorityTableRows,
  type TableStep,
  type TableActivity,
  type AuthorityAssignmentData,
  type AuthorityDirection,
} from "./authority-table";

export type StepAuthoritySummary = {
  slaDays: number | null;
  threshold: number | null;
  direction: AuthorityDirection;
};

/**
 * One summary per step, keyed by step id. A step with more than one Activity
 * row takes its first by the same order those Activities already display in
 * everywhere else (Authority Matrix, RACI) — not a case expected to arise
 * often, and not one where a different tie-break would change what the
 * feature is for.
 */
export function buildStepAuthoritySummary(
  steps: TableStep[],
  activities: TableActivity[],
  assignments: AuthorityAssignmentData[]
): Map<string, StepAuthoritySummary> {
  const rows = buildAuthorityTableRows(steps, activities, assignments);
  const byStepId = new Map<string, StepAuthoritySummary>();
  for (const row of rows) {
    if (!row.stepId || byStepId.has(row.stepId)) continue;
    byStepId.set(row.stepId, { slaDays: row.slaDays, threshold: row.threshold, direction: row.direction });
  }
  return byStepId;
}
