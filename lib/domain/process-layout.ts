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
  // Wider and taller than a task card despite carrying less text: a decision
  // is drawn as a diamond, and only the middle of a diamond is writable — see
  // DECISION_TEXT_INSET.
  decision: { x: 115, y: 70 },
  terminal: { x: 63, y: 27 },
};

/**
 * How much of a decision's bounding box its label may actually occupy, per
 * side.
 *
 * A diamond with width W and height H has, at any point, a horizontal chord
 * that narrows to nothing at the top and bottom vertices, so a centred box of
 * W/2 x H/2 is exactly the largest rectangle whose corners still touch the
 * edges. Text is laid out inside that box rather than the full node, which is
 * why a decision's box has to be roughly twice the size of the text it holds.
 */
export const DECISION_TEXT_INSET = 0.5;

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

/* ------------------------------------------------------------------ */
/* Wrapping a long map                                                 */
/* ------------------------------------------------------------------ */

/**
 * Laying a long process out across several rows instead of one.
 *
 * The printed report draws a process as one horizontal row and shrinks the
 * whole drawing until it fits the page. Nothing is lost, but a 22-step process
 * comes out at about a centimetre a step — complete and unreadable. Dealing the
 * steps into rows keeps every step at the size the interactive map already
 * draws them at, which is the size nobody complains about.
 *
 * Two things make this more than a `chunk()`:
 *
 *  - It is a **swimlane** diagram, so each row needs its own lanes — and only
 *    the ones its own steps use, or a row wastes a third of the page on an
 *    empty band.
 *  - A connection whose ends land on different rows cannot be routed around
 *    the steps, because the space it would route through is the next row's
 *    lanes. It breaks into a marked pair instead, which is what printed
 *    flowcharts have always done and for exactly this reason.
 *
 * Pure: no DOM, no Prisma. Only the report's static diagram and the deck call
 * it — the interactive Process Map goes on reading stored positions, because
 * that is where a consultant arranges steps by hand and wrapping would fight
 * them.
 */
/**
 * The compact geometry a wrapped map is drawn at in print.
 *
 * Wrapping alone was not enough. A readable step is 262px wide, and A4
 * landscape gives about 1030x688px of content, so a 22-step process needed
 * eight rows and 1712px of height — which then had to be scaled to 0.39 to fit
 * one page, putting the label text at about 5.7px. Wrapping had converted a
 * width problem into a height problem.
 *
 * A smaller card is the way out: at this spacing six steps fit a row instead
 * of three, so the same process needs four rows rather than eight and barely
 * has to be scaled at all. The card that goes with it drops the chrome — SLA
 * chips, cross-process links — and keeps the number, the label and the role,
 * which is what a reader of a printed overview actually needs. The detail
 * lives in the step narrative below the diagram, at full size.
 */
export const PRINT_STEP_X_SPACING = 150;
export const PRINT_LANE_HEIGHT = 92;

/**
 * Vertical space between one row of a wrapped map and the next.
 *
 * A lane's label is drawn above its band, so rows stacked flush against each
 * other put the first label of one row on top of the last lane of the row
 * before it — which clipped it in half.
 */
export const WRAPPED_ROW_GAP = 30;

/** Half-width/half-height of a compact print card, mirroring NODE_HALF_SIZE. */
export const PRINT_NODE_HALF_SIZE: Record<"task" | "decision" | "terminal", { x: number; y: number }> = {
  task: { x: 65, y: 32 },
  decision: { x: 70, y: 40 },
  terminal: { x: 44, y: 18 },
};

export type WrapStep = {
  id: string;
  assignedRoleId: string | null;
  swimlaneRoleId: string | null;
  positionX: number;
  positionY: number;
};

export type WrappedLane = {
  /** null is the Unassigned lane. */
  roleId: string | null;
  label: string;
  /** Top of this lane, relative to its row. */
  y: number;
};

export type PlacedStep = {
  id: string;
  /** Along the row, in the same units an unwrapped map uses. */
  x: number;
  /** Absolute, across the whole layout. */
  y: number;
  row: number;
  laneIndex: number;
};

export type WrappedRow = {
  index: number;
  lanes: WrappedLane[];
  steps: PlacedStep[];
  y: number;
  height: number;
  /** 1-based, as a reader counts. Null on the last row. */
  continuesOnto: number | null;
  /** 1-based. Null on the first row. */
  continuesFrom: number | null;
};

export type WrappedMapLayout = {
  /** False when everything fitted one row — the caller renders as it always did. */
  wrapped: boolean;
  rows: WrappedRow[];
  width: number;
  height: number;
  /** Steps per row. Exposed so a caller can size its box and a test can assert it. */
  capacity: number;
};

export type CrossRowMarker = {
  stepId: string;
  kind: "continues" | "from";
  /** 1-based, as a reader counts. */
  otherRow: number;
};

/**
 * Steps per row for a box this wide. Never fewer than two — one step a row is
 * a column, not a map.
 *
 * The lower bound is load-bearing in a way worth naming: the row count is
 * derived by dividing by this, so a capacity of zero does not produce a bad
 * layout, it produces an infinite one. Removing the clamp during a mutation
 * check hung the test runner rather than failing it, which on a report page
 * would be a hung request. It is clamped again at the point of use below, so
 * the hazard cannot come back by editing this one expression.
 */
export const MIN_ROW_CAPACITY = 2;

function rowCapacity(boxWidth: number, spacing: number = STEP_X_SPACING): number {
  if (!Number.isFinite(boxWidth) || boxWidth <= 0 || !Number.isFinite(spacing) || spacing <= 0) {
    return MIN_ROW_CAPACITY;
  }
  return Math.max(MIN_ROW_CAPACITY, Math.floor(boxWidth / spacing));
}

export function wrapProcessMap(
  steps: WrapStep[],
  options: {
    boxWidth: number;
    laneLabel: (roleId: string | null) => string;
    /** Defaults to the on-screen geometry; print passes the compact one. */
    stepSpacing?: number;
    laneHeight?: number;
  }
): WrappedMapLayout {
  const spacing = options.stepSpacing ?? STEP_X_SPACING;
  const laneH = options.laneHeight ?? LANE_HEIGHT;
  // Clamped a second time deliberately: everything below divides by this, so
  // a zero would be an infinite layout rather than a wrong one.
  const capacity = Math.max(MIN_ROW_CAPACITY, rowCapacity(options.boxWidth, spacing));

  // The order the interactive map and the Steps List already show. This
  // re-flows that order; it does not re-derive one from the connection graph,
  // which would make the printed map disagree with the screen. The id breaks
  // a tie so two steps at the same coordinates lay out the same way twice.
  const ordered = [...steps].sort(
    (a, b) => a.positionX - b.positionX || a.positionY - b.positionY || a.id.localeCompare(b.id)
  );

  if (ordered.length === 0) {
    return { wrapped: false, rows: [], width: 0, height: 0, capacity };
  }

  // Lane order across the whole process, so a role sits in the same relative
  // place on every row it appears on rather than jumping about.
  const laneOrder = assignSwimlanes(
    ordered.map((s) => ({
      id: s.id,
      assignedRoleId: s.assignedRoleId,
      swimlaneRoleId: s.swimlaneRoleId,
    }))
  ).laneOrder;
  const roleRank = (roleId: string | null) =>
    roleId === null ? laneOrder.length : laneOrder.indexOf(roleId);

  const rowCount = Math.ceil(ordered.length / capacity);
  const rows: WrappedRow[] = [];
  let y = 0;

  for (let index = 0; index < rowCount; index++) {
    const slice = ordered.slice(index * capacity, (index + 1) * capacity);

    // Only the lanes this row's own steps need (FR-009), in whole-process order.
    const roleIds = [...new Set(slice.map((s) => s.swimlaneRoleId ?? s.assignedRoleId))].sort(
      (a, b) => roleRank(a) - roleRank(b)
    );
    const lanes: WrappedLane[] = roleIds.map((roleId, i) => ({
      roleId,
      label: roleId === null ? "Unassigned" : options.laneLabel(roleId),
      y: i * laneH,
    }));

    const placed: PlacedStep[] = slice.map((step, column) => {
      const roleId = step.swimlaneRoleId ?? step.assignedRoleId;
      const laneIndex = roleIds.indexOf(roleId);
      return {
        id: step.id,
        x: spacing / 2 + column * spacing,
        y: y + laneIndex * laneH + laneH / 2,
        row: index,
        laneIndex,
      };
    });

    const height = lanes.length * laneH;
    rows.push({
      index,
      lanes,
      steps: placed,
      y,
      height,
      continuesOnto: index < rowCount - 1 ? index + 2 : null,
      continuesFrom: index > 0 ? index : null,
    });
    y += height + WRAPPED_ROW_GAP;
  }

  return {
    wrapped: rowCount > 1,
    rows,
    width: Math.min(capacity, ordered.length) * spacing,
    // The trailing gap belongs between rows, not after the last one.
    height: Math.max(0, y - WRAPPED_ROW_GAP),
    capacity,
  };
}

/**
 * The connections that had to be broken, and what to write at each end.
 *
 * A same-row connection is still an ordinary edge; only one crossing a row
 * boundary becomes a pair of markers.
 */
export function crossRowMarkers(
  layout: WrappedMapLayout,
  connections: { fromStepId: string; toStepId: string }[]
): CrossRowMarker[] {
  const rowOf = new Map<string, number>();
  for (const row of layout.rows) for (const step of row.steps) rowOf.set(step.id, row.index);

  const markers: CrossRowMarker[] = [];
  for (const connection of connections) {
    const from = rowOf.get(connection.fromStepId);
    const to = rowOf.get(connection.toStepId);
    if (from === undefined || to === undefined || from === to) continue;
    markers.push({ stepId: connection.fromStepId, kind: "continues", otherRow: to + 1 });
    markers.push({ stepId: connection.toStepId, kind: "from", otherRow: from + 1 });
  }
  return markers;
}
