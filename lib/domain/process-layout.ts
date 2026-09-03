/**
 * Auto-layout for newly added Process Map steps — swimlane assignment by Role
 * and left-to-right placement. Pure and framework-free (no DB/canvas imports)
 * so it's unit-testable in isolation; purely presentational, not a governed
 * business rule, so it's tested lightly rather than test-first.
 */

export const LANE_HEIGHT = 214;
export const LANE_TOP_OFFSET = 40;
export const LANE_NODE_Y_OFFSET = LANE_HEIGHT / 2;
export const STEP_X_SPACING = 262;
export const FIRST_STEP_X = 210;

/**
 * Half-width/half-height per node kind, in the same units as position/lane
 * math above — the single source of a step card's drawn size, shared by the
 * live canvas, the static print/PDF diagram, and the PPTX export so a task,
 * decision, or terminal step is the same size everywhere it's drawn.
 */
export const NODE_HALF_SIZE: Record<"task" | "decision" | "terminal", { x: number; y: number }> = {
  task: { x: 107, y: 56 },
  decision: { x: 88, y: 46 },
  terminal: { x: 63, y: 27 },
};

/** Y-coordinate for a step's swimlane, given the workspace-wide lane order for this process. */
export function laneY(roleId: string | null, laneOrder: string[]): number {
  const index = roleId ? laneOrder.indexOf(roleId) : -1;
  const lane = index === -1 ? laneOrder.length : index;
  return lane * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET;
}

/**
 * A step, as far as swimlane placement is concerned. swimlaneRoleId wins when
 * set, so a step can be drawn in one role's lane while being assigned to
 * another — dragging it between lanes is what sets it.
 */
export type LaneStep = { id: string; assignedRoleId: string | null; swimlaneRoleId: string | null };

export type SwimlaneLayout = {
  /** Role ids, in the order their lanes appear top to bottom. */
  laneOrder: string[];
  /** True when some step has no role and so needs a lane of its own at the bottom. */
  hasUnassignedLane: boolean;
  /** Total lanes drawn, including the unassigned one. */
  laneCount: number;
  /** Lane index per step id. */
  laneIndexOf: Map<string, number>;
  /** Centre y per step id — where the node actually goes. */
  yOf: Map<string, number>;
};

/**
 * Works out which lane every step belongs in, from its role.
 *
 * This is the single answer to "where does this step sit vertically", used
 * both to draw the lanes and to place the nodes in them. They used to be
 * worked out separately — lanes from the roles at render time, nodes from a
 * positionY frozen when the step was created — so assigning a role afterwards
 * moved the lane but left the node behind in whichever lane existed when it
 * was added.
 */
export function assignSwimlanes(steps: LaneStep[]): SwimlaneLayout {
  const laneOrder: string[] = [];
  for (const step of steps) {
    const roleId = step.swimlaneRoleId ?? step.assignedRoleId;
    if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
  }

  const hasUnassignedLane = steps.some((s) => !(s.swimlaneRoleId ?? s.assignedRoleId));

  const laneIndexOf = new Map<string, number>();
  const yOf = new Map<string, number>();
  for (const step of steps) {
    const roleId = step.swimlaneRoleId ?? step.assignedRoleId;
    const index = roleId ? laneOrder.indexOf(roleId) : -1;
    const lane = index === -1 ? laneOrder.length : index;
    laneIndexOf.set(step.id, lane);
    yOf.set(step.id, lane * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  }

  return {
    laneOrder,
    hasUnassignedLane,
    laneCount: laneOrder.length + (hasUnassignedLane ? 1 : 0),
    laneIndexOf,
    yOf,
  };
}

/**
 * The lane a node dropped at this y belongs to — how a vertical drag is read
 * as "put this step in that lane". Clamped, so dropping above the first lane
 * or below the last picks the nearest one rather than an index off the end.
 */
export function laneIndexAtY(centerY: number, laneCount: number): number {
  const raw = Math.floor((centerY - LANE_TOP_OFFSET) / LANE_HEIGHT);
  return Math.max(0, Math.min(raw, Math.max(laneCount - 1, 0)));
}

/** The role a lane belongs to, or null for the unassigned lane at the bottom. */
export function roleIdForLane(laneIndex: number, laneOrder: string[]): string | null {
  return laneOrder[laneIndex] ?? null;
}

/** X-coordinate for the next step appended to the right of the existing map. */
export function nextStepX(existingPositionsX: number[]): number {
  if (existingPositionsX.length === 0) return FIRST_STEP_X;
  return Math.max(...existingPositionsX) + STEP_X_SPACING;
}
