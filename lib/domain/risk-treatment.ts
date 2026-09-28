/**
 * The Risk Register's heat map and treatment-plan rules (spec 027) — pure,
 * so they're unit-tested without a database and shared by the page and the
 * register.
 */

import type { RiskImpact, RiskLikelihood, RiskStatus } from "@/app/generated/prisma/client";
import { deriveRiskLevel, type RiskLevel } from "@/lib/domain/governance-risk";
import { dayOf } from "@/lib/domain/checklist-due";

/** Top row first: the conventional orientation, most likely at the top. */
export const LIKELIHOOD_ROWS: readonly RiskLikelihood[] = ["HIGH", "MEDIUM", "LOW"];
export const IMPACT_ORDER: readonly RiskImpact[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export type HeatMapCell = {
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  level: RiskLevel;
  count: number;
  riskIds: string[];
};

/**
 * One cell per likelihood × impact, counting the given risks that aren't
 * Closed. The caller passes whatever the register is showing, so a cell
 * filters the table to exactly the rows it counted.
 */
export function heatMapCells(
  risks: readonly { id: string; likelihood: RiskLikelihood; impact: RiskImpact; status: RiskStatus }[]
): HeatMapCell[] {
  return LIKELIHOOD_ROWS.flatMap((likelihood) =>
    IMPACT_ORDER.map((impact) => {
      const riskIds = risks
        .filter((r) => r.status !== "CLOSED" && r.likelihood === likelihood && r.impact === impact)
        .map((r) => r.id);
      return { likelihood, impact, level: deriveRiskLevel(likelihood, impact), count: riskIds.length, riskIds };
    })
  );
}

/** Overdue by calendar day, like checklist items: due today isn't late yet. */
export function isTreatmentActionOverdue(dueDate: Date | null, doneAt: Date | null, today: Date): boolean {
  if (!dueDate || doneAt) return false;
  return dayOf(dueDate) < dayOf(today);
}
