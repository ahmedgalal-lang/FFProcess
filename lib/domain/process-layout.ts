/**
 * Auto-layout for newly added Process Map steps — swimlane assignment by Role
 * and left-to-right placement. Pure and framework-free (no DB/canvas imports)
 * so it's unit-testable in isolation; purely presentational, not a governed
 * business rule, so it's tested lightly rather than test-first.
 */

export const LANE_HEIGHT = 130;
export const LANE_TOP_OFFSET = 40;
export const LANE_NODE_Y_OFFSET = 65;
export const STEP_X_SPACING = 170;
export const FIRST_STEP_X = 190;

/** Y-coordinate for a step's swimlane, given the workspace-wide lane order for this process. */
export function laneY(roleId: string | null, laneOrder: string[]): number {
  const index = roleId ? laneOrder.indexOf(roleId) : -1;
  const lane = index === -1 ? laneOrder.length : index;
  return lane * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET;
}

/** X-coordinate for the next step appended to the right of the existing map. */
export function nextStepX(existingPositionsX: number[]): number {
  if (existingPositionsX.length === 0) return FIRST_STEP_X;
  return Math.max(...existingPositionsX) + STEP_X_SPACING;
}
