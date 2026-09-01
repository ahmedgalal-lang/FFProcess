/**
 * What a step still needs before it's actually documented.
 *
 * A step can be created anywhere — the Process Map, a bulk paste, the Value
 * Chain board, a spreadsheet import — and every route leaves the same holes:
 * nothing flows into it, nobody is accountable for it, no approver is named.
 * The RACI and Authority matrices each flag their own gap on their own page,
 * which only helps someone already looking at that page. This collects them so
 * a step can carry its own unfinished business wherever it's shown.
 *
 * It deliberately runs the *same* builders and validators those two pages use
 * rather than re-deriving the rules: a row belongs to an Activity when the step
 * has one and to the step itself when it doesn't, and an authority assignment
 * is keyed by whichever of the two it was attached to. Re-implementing that
 * lookup is how a chip ends up disagreeing with the matrix it's summarising.
 *
 * Pure and framework-free (Constitution Principle III).
 */

import {
  buildAuthorityTableRows,
  validateAuthorityTable,
  type AuthorityAssignmentData,
} from "./authority-table";
import { buildRaciTableRows, type TableActivity, type TableStep } from "./raci-table";
import { validateRaciMatrix, type RaciCode } from "./raci-validation";

export type StepGap =
  | "PREDECESSOR"
  | "ACCOUNTABLE"
  | "TOO_MANY_ACCOUNTABLE"
  | "RESPONSIBLE"
  | "APPROVER"
  | "CO_APPROVER";

/** Short labels, for a chip that has to fit on one line. */
export const STEP_GAP_LABELS: Record<StepGap, string> = {
  PREDECESSOR: "no predecessor",
  ACCOUNTABLE: "no accountable",
  TOO_MANY_ACCOUNTABLE: "two accountables",
  RESPONSIBLE: "no responsible",
  APPROVER: "no approver",
  CO_APPROVER: "no co-approver",
};

/** The longer sentence, for a tooltip. */
export const STEP_GAP_DESCRIPTIONS: Record<StepGap, string> = {
  PREDECESSOR: "Nothing connects into this step yet — set what it follows on the Process Map.",
  ACCOUNTABLE: "No role is accountable for this step — assign an A in the RACI Matrix.",
  TOO_MANY_ACCOUNTABLE: "More than one role is accountable — exactly one A belongs on each task.",
  RESPONSIBLE: "No role is responsible for this step — assign an R in the RACI Matrix.",
  APPROVER: "No approver is named for this step — set one in the Authority Matrix.",
  CO_APPROVER: "A co-approval threshold is set but no co-approver is named — set one in the Authority Matrix.",
};

/** The order gaps are filled in: what feeds it, who owns it, then who signs it off. */
const GAP_ORDER: StepGap[] = [
  "PREDECESSOR",
  "ACCOUNTABLE",
  "TOO_MANY_ACCOUNTABLE",
  "RESPONSIBLE",
  "APPROVER",
  "CO_APPROVER",
];

export type ReadinessInput = {
  steps: TableStep[];
  activities: (TableActivity & { assignments: { roleId: string; code: RaciCode }[] })[];
  authorityAssignments: AuthorityAssignmentData[];
  /** Ids of steps something connects into. */
  incomingStepIds: Set<string>;
};

/**
 * Every step's outstanding gaps, keyed by step id. A step with nothing missing
 * gets an empty list rather than being absent, so callers can look one up
 * without checking whether it's there.
 */
export function deriveGapsByStep(input: ReadinessInput): Map<string, StepGap[]> {
  const gaps = new Map<string, Set<StepGap>>(input.steps.map((step) => [step.id, new Set()]));
  const add = (stepId: string | null, gap: StepGap) => {
    if (stepId) gaps.get(stepId)?.add(gap);
  };

  for (const step of input.steps) {
    // A START step legitimately begins the flow; anything else should be fed.
    if (step.type !== "START" && !input.incomingStepIds.has(step.id)) add(step.id, "PREDECESSOR");
  }

  const raciRows = buildRaciTableRows(input.steps, input.activities);
  const raciStepIdByRowId = new Map(raciRows.map((row) => [row.id, row.stepId]));
  const raciIssues = validateRaciMatrix(
    raciRows
      .filter((row) => !row.skipped)
      .map((row) => ({
        activityId: row.id,
        name: row.label,
        assignments: Object.entries(row.assignments).map(([roleId, code]) => ({ roleId, code })),
      }))
  );
  for (const issue of raciIssues) {
    const stepId = raciStepIdByRowId.get(issue.activityId) ?? null;
    if (issue.type === "MISSING_ACCOUNTABLE") add(stepId, "ACCOUNTABLE");
    if (issue.type === "MULTIPLE_ACCOUNTABLE") add(stepId, "TOO_MANY_ACCOUNTABLE");
    if (issue.type === "MISSING_RESPONSIBLE") add(stepId, "RESPONSIBLE");
  }

  const authorityRows = buildAuthorityTableRows(input.steps, input.activities, input.authorityAssignments);
  const authorityStepIdByRowId = new Map(authorityRows.map((row) => [row.id, row.stepId]));
  for (const issue of validateAuthorityTable(authorityRows)) {
    const stepId = authorityStepIdByRowId.get(issue.rowId) ?? null;
    if (issue.type === "MISSING_APPROVER") add(stepId, "APPROVER");
    if (issue.type === "MISSING_CO_APPROVER") add(stepId, "CO_APPROVER");
  }

  return new Map(
    [...gaps].map(([stepId, set]) => [stepId, GAP_ORDER.filter((gap) => set.has(gap))])
  );
}
