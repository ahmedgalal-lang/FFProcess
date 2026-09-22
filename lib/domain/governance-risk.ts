/**
 * Deriving a risk's overall level from its likelihood and impact, rather
 * than storing a third column that could drift from the two it's computed
 * from — the same move deriveControlPoints (process-report.ts) already makes
 * for the existing Governance page's Key Control Points: read from what's
 * stored, not persist a value that's a function of it.
 */

import type { RiskLikelihood, RiskImpact } from "@/app/generated/prisma/client";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

const LIKELIHOOD_SCORE: Record<RiskLikelihood, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const IMPACT_SCORE: Record<RiskImpact, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/**
 * likelihood × impact, banded into three levels. A CRITICAL impact never
 * reads as merely LOW overall, even paired with LOW likelihood (score 4) —
 * a rare-but-catastrophic risk (client fund commingling, say) belongs on a
 * consultant's radar the same way a frequent-but-minor one does, just via a
 * different path, which is why this is a product banded into three rather
 * than the raw score shown directly.
 */
export function deriveRiskLevel(likelihood: RiskLikelihood, impact: RiskImpact): RiskLevel {
  const score = LIKELIHOOD_SCORE[likelihood] * IMPACT_SCORE[impact];
  if (score >= 6) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}
