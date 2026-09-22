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
 * Clear space left between two cards standing side by side on one line.
 *
 * Only a bandless row needs this. With lane bands, neighbouring steps are
 * usually in different lanes and so at different heights, and a card wider
 * than the column spacing simply overlapped the column beside it without
 * anyone noticing — a decision is 176px wide against a 150px column. Collapse
 * the lanes and every step in the row is on one line, where that overlap
 * means there is no clear strip beside the card at all: the connector router
 * then has to leave through the top or the bottom and travel around, which is
 * how a straight run of six steps turned into a row of detours.
 */
export const PRINT_CARD_GUTTER = 20;

/**
 * Vertical space between one row of a wrapped map and the next.
 *
 * A lane's label is drawn above its band, so rows stacked flush against each
 * other put the first label of one row on top of the last lane of the row
 * before it — which clipped it in half.
 */
export const WRAPPED_ROW_GAP = 46;

/**
 * Width reserved to the left of a wrapped map for the lane names.
 *
 * The lane name used to be drawn inside the lane, at its top-left — which is
 * exactly where the row's first step also wants to be. On a real export a
 * decision diamond sat squarely on top of "HEAD OF COMMERCIAL AND BUSINESS
 * DEVELOPMENT". A gutter takes the name out of the steps' way for good.
 */
export const WRAPPED_LANE_GUTTER = 170;

/** How many characters of a role name a compact card will carry. */
export const CARD_ROLE_BUDGET = 20;

/**
 * A role name cut to fit a compact card, on a word boundary.
 *
 * "HEAD OF COMMERCIAL AND BUSINESS DEVELOPMENT" is four lines on a card whose
 * own step name is one. The lane in the gutter still carries it in full, and
 * the card carries enough to recognise it.
 */
export function shortRoleName(name: string, budget: number = CARD_ROLE_BUDGET): string {
  const trimmed = name.trim();
  if (trimmed.length <= budget) return trimmed;
  const words = trimmed.split(/\s+/);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > budget) break;
    out = next;
  }
  // A single word longer than the budget still has to be cut somewhere.
  if (!out) out = trimmed.slice(0, budget);
  return `${out}\u2026`;
}

/** Half-width/half-height of a compact print card, mirroring NODE_HALF_SIZE. */
export const PRINT_NODE_HALF_SIZE: Record<"task" | "decision" | "terminal", { x: number; y: number }> = {
  task: { x: 65, y: 32 },
  // Bigger than a task despite saying less, and by more than the full-size
  // pair are: only the middle of a diamond is writable (DECISION_TEXT_INSET),
  // so the box has to be about twice the text it holds. Printing the report
  // and reading it caught this — "Evaluate the opportunity" came out as "the
  // opportunity", with the first word not merely hidden but absent from the
  // PDF's text layer. A step's name being wrong in a client's document is a
  // correctness bug, not a cosmetic one.
  decision: { x: 88, y: 52 },
  terminal: { x: 44, y: 18 },
};

export type WrapStep = {
  id: string;
  assignedRoleId: string | null;
  swimlaneRoleId: string | null;
  positionX: number;
  positionY: number;
  /**
   * The card shape this step draws as, in the same terms as
   * PRINT_NODE_HALF_SIZE. Only read when a bandless row needs to size itself
   * to its tallest card — see the `bands` option below. Defaults to "task",
   * which is right for most steps and merely conservative (not wrong) for a
   * step whose card is actually shorter.
   */
  kind?: "task" | "decision" | "terminal";
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
  /**
   * Which slot along the row this step occupies, counting from the left
   * whichever way the row runs. Two steps in the same column on adjacent rows
   * sit directly above one another, which is what makes the seam between rows
   * drawable as a straight drop.
   */
  column: number;
};

export type WrappedRow = {
  index: number;
  lanes: WrappedLane[];
  steps: PlacedStep[];
  y: number;
  height: number;
  /**
   * Which way the work runs along this row. Rows alternate, so a row begins
   * directly beneath the step the row above ended on and the join between
   * them is a short drop rather than a jump back across the page.
   */
  direction: "forward" | "backward";
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
    /**
     * When false, a row is drawn as a single band sized to its tallest card
     * rather than one band per role its steps use — the printed report's
     * defect was a row of six steps across five roles being drawn five lanes
     * tall while never more than one card tall in any column. Defaults to
     * true, which reproduces today's per-role banding exactly, so the only
     * other caller (the PPTX slide deck) is unaffected unless it opts in.
     */
    bands?: boolean;
  }
): WrappedMapLayout {
  const laneH = options.laneHeight ?? LANE_HEIGHT;
  const bands = options.bands ?? true;

  // A bandless row puts every one of its steps on one line, so a card wider
  // than the column spacing no longer merely overlaps an empty column — it
  // overlaps its neighbour, leaving the connector router no clear strip to
  // leave through and forcing it into a detour out of the card's bottom and
  // back up again. Widening the column to clear the widest card the process
  // actually holds is what keeps a run of consecutive steps a straight line.
  // Costs a step a row on a process containing a decision, which is cheap
  // against the rows a bandless map saves.
  const widestCard = Math.max(
    0,
    ...steps.map((s) => PRINT_NODE_HALF_SIZE[s.kind ?? "task"].x * 2)
  );
  const requestedSpacing = options.stepSpacing ?? STEP_X_SPACING;
  const spacing = bands
    ? requestedSpacing
    : Math.max(requestedSpacing, widestCard + PRINT_CARD_GUTTER);
  // Clamped a second time deliberately: everything below divides by this, so
  // a zero would be an infinite layout rather than a wrong one.
  const capacity = Math.max(MIN_ROW_CAPACITY, rowCapacity(options.boxWidth, spacing));

  // The order the caller was given the steps in — the Steps List's own
  // `order` column, which every caller already queries by — not the order
  // implied by where each card was dragged on the canvas.
  //
  // This used to re-sort by positionX on the theory that position "is" the
  // Steps List order, which is true only until someone drags a card:
  // dragging writes positionX/Y and nothing else, so the two fall out of
  // step on the very first edit. From then on the row a step landed in, and
  // the "Steps N–M" range printed above it, were decided by wherever it
  // happened to sit on the canvas rather than by the sequence the process
  // actually runs in — row ranges went non-contiguous and even ran backwards
  // ("Steps 15–1"), and a connection between two steps that were adjacent in
  // the process but far apart on the canvas was broken into a marked
  // cross-row pair for no reason a reader could see. The printed map is a
  // narrative document; it has to read in the order the process runs in,
  // which is this array's own order, regardless of how the map looks on
  // screen.
  const ordered = steps;

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

    // Serpentine: every other row runs right to left, so its first step lands
    // in the same column the previous row's last step occupies. The cost is
    // that a backward row's numbers descend as you read across it, which is
    // why the row label says which way it runs.
    const direction: "forward" | "backward" = index % 2 === 1 ? "backward" : "forward";

    // With bands, a row is as tall as every lane its steps touch, stacked —
    // which is what made a row of six steps across five roles draw five
    // lanes tall while never more than one card tall in any column. Without
    // them, a row is a single band sized to its tallest card, whatever role
    // that card happens to belong to. PRINT_NODE_HALF_SIZE is used directly
    // rather than threaded through as another option: a bandless row only
    // exists for the printed report today, which is the only caller that
    // draws the compact card this size describes.
    const height = bands
      ? lanes.length * laneH
      : Math.max(...slice.map((s) => PRINT_NODE_HALF_SIZE[s.kind ?? "task"].y * 2)) + WRAPPED_ROW_GAP;

    const placed: PlacedStep[] = slice.map((step, position) => {
      const roleId = step.swimlaneRoleId ?? step.assignedRoleId;
      const laneIndex = bands ? roleIds.indexOf(roleId) : 0;
      // A backward row starts at the far end of the *capacity*, not of its own
      // length: a short final row still has to begin under the step above it.
      const column = direction === "backward" ? capacity - 1 - position : position;
      return {
        id: step.id,
        x: spacing / 2 + column * spacing,
        // Banded: the step's own lane offset within the row. Bandless: every
        // step in the row shares the row's own centre — there is only one
        // band, so a decision and a task beside it both sit on the same line
        // rather than at baselines that differ for no visible reason.
        y: bands ? y + laneIndex * laneH + laneH / 2 : y + height / 2,
        row: index,
        laneIndex,
        column,
      };
    });

    rows.push({
      index,
      lanes,
      steps: placed,
      y,
      height,
      direction,
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
/**
 * Whether a connection between two rows can simply be drawn.
 *
 * With serpentine rows the step a row ends on and the step the next row begins
 * on share a column, so the line between them is a short vertical drop that
 * crosses nothing. That is the seam, and it needs no marker.
 *
 * Every other cross-row connection still does: a jump from the middle of one
 * row to the middle of another would have to travel through the swimlanes in
 * between, and routing around the steps means crossing the lanes instead.
 * Non-adjacent rows are excluded for the same reason even when the columns
 * happen to line up — the line would pass straight through the rows between.
 */
export function isSeamConnection(
  layout: WrappedMapLayout,
  connection: { fromStepId: string; toStepId: string }
): boolean {
  const placed = new Map<string, PlacedStep>();
  for (const row of layout.rows) for (const step of row.steps) placed.set(step.id, step);

  const from = placed.get(connection.fromStepId);
  const to = placed.get(connection.toStepId);
  if (!from || !to) return false;
  return to.row === from.row + 1 && to.column === from.column;
}

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
    // The seam is drawn, so marking it as well would say twice, in two
    // different visual languages, what one short line already says.
    if (isSeamConnection(layout, connection)) continue;
    markers.push({ stepId: connection.fromStepId, kind: "continues", otherRow: to + 1 });
    markers.push({ stepId: connection.toStepId, kind: "from", otherRow: from + 1 });
  }
  return markers;
}
