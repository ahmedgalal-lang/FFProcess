"use client";

import { useCallback, useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, MarkerType, type Node, type Edge } from "@xyflow/react";
import {
  assignSwimlanes,
  crossRowMarkers,
  isSeamConnection,
  wrapProcessMap,
  LANE_HEIGHT,
  LANE_TOP_OFFSET,
  NODE_HALF_SIZE,
  PRINT_LANE_HEIGHT,
  PRINT_NODE_HALF_SIZE,
  PRINT_STEP_X_SPACING,
  WRAPPED_LANE_GUTTER,
  WRAPPED_ROW_GAP,
} from "@/lib/domain/process-layout";
import { MAX_BLOCK_WITH_HEADING_PX } from "@/lib/domain/report-pagination";
import { routeConnectors, type ConnectorRoute, type RoutedStep } from "@/lib/domain/connector-routing";
import type { AuthorityDirection } from "@/lib/domain/authority-table";
import {
  TaskNode,
  DecisionNode,
  TerminalNode,
  LaneNode,
  ContinuationNode,
  CompactStepNode,
  RowLabelNode,
  RowRuleNode,
  LinkStubNode,
  type StepLinkData,
} from "./map-nodes";
import { RoutedEdge } from "./routed-edge";

const NODE_TYPES = {
  task: TaskNode,
  decision: DecisionNode,
  terminal: TerminalNode,
  lane: LaneNode,
  continuation: ContinuationNode,
  compact: CompactStepNode,
  rowlabel: RowLabelNode,
  rowrule: RowRuleNode,
  linkstub: LinkStubNode,
};

const EDGE_TYPES = { routed: RoutedEdge };

const HALF_SIZE = NODE_HALF_SIZE;

/**
 * How wide the row label pill draws, so a right-aligned one clears the edge.
 *
 * Sized for the longest form — a backward row adds "← runs right to left" —
 * because this both positions the label and measures the map's extent. At 250
 * the backward label hung 26px past its own box and was clipped.
 */
const ROW_LABEL_WIDTH = 300;

/**
 * How wide each kind of node draws, so the map's true extent can be measured
 * rather than guessed.
 *
 * A fixed "overhang" constant could not work: generous enough to keep a
 * continuation marker from being clipped, it left a visible strip of page
 * unused; tight enough to fill the page, it clipped the marker. The nodes know
 * their own sizes, so the extent is computed from them.
 */
const EXTENT_SLACK = 16;

const NODE_WIDTH: Record<string, number> = {
  rowlabel: ROW_LABEL_WIDTH,
  continuation: 118,
  linkstub: 64,
};

/** The same, vertically, so a group's box is sized to what it actually holds. */
const NODE_HEIGHT: Record<string, number> = {
  rowlabel: 20,
  rowrule: 4,
  continuation: 22,
  linkstub: 16,
};

/** The printable width of an A4 landscape report page, which is what this is drawn into. */
const PAGE_CONTENT_WIDTH_PX = (297 - 14 * 2) * (96 / 25.4);

type StepT = {
  id: string;
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  positionX: number;
  positionY: number;
  assignedRole: { id: string; name: string } | null;
  swimlaneRole: { id: string; name: string } | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
  slaDays?: number | null;
  threshold?: number | null;
  direction?: AuthorityDirection;
};

type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };

function nodeKindFor(type: StepT["type"]): keyof typeof HALF_SIZE {
  if (type === "DECISION") return "decision";
  if (type === "START" || type === "END") return "terminal";
  return "task";
}

/**
 * How a connector looks: which handles it uses, from the route, and whether it
 * reads as a loop, which the caller decides.
 *
 * Keeping those apart matters most here. A serpentine row runs right to left,
 * so on that row every ordinary step-to-step connector is drawn leaving its
 * card's left — and not one of them is a loop.
 */
function edgeAppearance(route: ConnectorRoute | undefined, backward: boolean) {
  const stroke = backward ? "#d97706" : "#64748b";
  return {
    sourceHandle: route?.source.side ?? "right",
    targetHandle: `${route?.target.side ?? "left"}-t`,
    style: backward
      ? { stroke, strokeWidth: 2, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke" as const }
      : { stroke, strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const },
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
  };
}

/**
 * A read-only rendering of the Process Map diagram for the workspace Export
 * report — same node/edge shapes as the interactive ProcessMapCanvas, but with
 * no drag, connect, or delete wiring, so it's safe to embed in a preview/print
 * page without risking an accidental edit to the real Process Map.
 */
export function StaticProcessMapDiagram({
  workspaceId,
  steps,
  connections,
}: {
  workspaceId: string;
  steps: StepT[];
  connections: ConnectionT[];
}) {
  // Same answer the interactive Process Map gives — lanes and node placement
  // both come from assignSwimlanes rather than a hand-rolled version of it, so
  // a step with no role (or one reassigned after the step was created) still
  // gets a correct lane instead of silently falling out of the diagram: the
  // earlier version only ever built a lane for a step that had a role, so a
  // process with any roleless steps lost its "Unassigned" lane entirely and
  // those steps rendered at their stale stored positionY — which, when every
  // step on a process shares that fate, collapses the whole diagram onto one
  // line instead of drawing it in swimlanes like every other process.
  const layout = useMemo(
    () =>
      assignSwimlanes(
        steps.map((s) => ({
          id: s.id,
          assignedRoleId: s.assignedRole?.id ?? null,
          swimlaneRoleId: s.swimlaneRole?.id ?? null,
        }))
      ),
    [steps]
  );
  const laneOrder = layout.laneOrder;

  const laneLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of steps) {
      const role = s.swimlaneRole ?? s.assignedRole;
      if (role) map.set(role.id, role.name);
    }
    return map;
  }, [steps]);

  /**
   * The printable content width of an A4 landscape report page. The map is
   * drawn into this, and it is what decides how many steps fit a row.
   */
  const BOX_WIDTH = (297 - 14 * 2) * (96 / 25.4);

  // A long process is dealt into rows at full step size rather than squeezed
  // into one row and shrunk until nobody can read it. A process that fits one
  // row takes the path it always took — `wrapped` is false and everything
  // below reads stored positions exactly as before.
  const wrap = useMemo(
    () =>
      wrapProcessMap(
        steps.map((s) => ({
          id: s.id,
          assignedRoleId: s.assignedRole?.id ?? null,
          swimlaneRoleId: s.swimlaneRole?.id ?? null,
          positionX: s.positionX,
          positionY: s.positionY,
        })),
        {
          boxWidth: BOX_WIDTH,
          laneLabel: (roleId) => laneLabel.get(roleId ?? "") ?? "",
          // The compact geometry: six steps a row instead of three, so a long
          // process needs four rows rather than eight and the drawing barely
          // has to be scaled at all.
          stepSpacing: PRINT_STEP_X_SPACING,
          laneHeight: PRINT_LANE_HEIGHT,
        }
      ),
    [steps, laneLabel, BOX_WIDTH]
  );

  const placedById = useMemo(
    () => new Map(wrap.rows.flatMap((r) => r.steps.map((s) => [s.id, s]))),
    [wrap]
  );

  const canvasWidth = wrap.wrapped
    ? wrap.width
    : Math.max(...steps.map((s) => s.positionX), 400) + 260;

  const nodes: Node[] = useMemo(() => {
    /** A step's 1-based position in the process, for the row label's range. */
    const stepNumberOf = (id: string | undefined) =>
      id === undefined ? 0 : steps.findIndex((s) => s.id === id) + 1;

    if (wrap.wrapped) {
      // Each row carries its own lanes, labelled, so a reader never has to
      // look back to an earlier row to know whose lane a step is in — on paper
      // they cannot scroll.
      const rowLaneNodes: Node[] = wrap.rows.flatMap((row) =>
        row.lanes.map((lane, i) => ({
          id: `lane-${row.index}-${lane.roleId ?? "unassigned"}`,
          type: "lane",
          // Shifted right by the gutter: the lane name used to be drawn at the
          // lane's own top-left, which is where the row's first step also
          // wants to be — a decision diamond sat on top of it on a real
          // export. The name now lives to the left of the map entirely.
          position: { x: WRAPPED_LANE_GUTTER, y: row.y + lane.y + LANE_TOP_OFFSET },
          data: { label: lane.label, tinted: i % 2 === 1, gutter: WRAPPED_LANE_GUTTER },
          style: { width: canvasWidth, height: PRINT_LANE_HEIGHT },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: 0,
        }))
      );

      // Row furniture: the label, the rule that ends the row before it, and
      // the short link to the next row. All teal, so they read as one set.
      const furniture: Node[] = wrap.rows.flatMap((row) => {
        const out: Node[] = [];
        // The label sits where the row *starts* — left on a forward row, right
        // on a backward one — so it is the first thing met rather than the
        // last, which on a right-to-left row is the difference between a
        // warning and an explanation after the fact.
        const backward = row.direction === "backward";
        const rowStartX = backward
          ? WRAPPED_LANE_GUTTER + canvasWidth - ROW_LABEL_WIDTH
          : WRAPPED_LANE_GUTTER;
        out.push({
          id: `rowlabel-${row.index}`,
          type: "rowlabel",
          position: { x: rowStartX, y: row.y + LANE_TOP_OFFSET - 30 },
          data: {
            row: row.index + 1,
            of: wrap.rows.length,
            firstStep: stepNumberOf(row.steps[0]?.id),
            lastStep: stepNumberOf(row.steps[row.steps.length - 1]?.id),
            backward,
          },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: 5,
        });
        if (row.index > 0) {
          out.push({
            id: `rowrule-${row.index}`,
            type: "rowrule",
            position: { x: 0, y: row.y + LANE_TOP_OFFSET - 48 },
            data: { width: canvasWidth + WRAPPED_LANE_GUTTER },
            draggable: false,
            selectable: false,
            focusable: false,
            zIndex: 0,
          });
        }
        return out;
      });

      const rowStepNodes: Node[] = steps.flatMap((s, i) => {
        const placed = placedById.get(s.id);
        if (!placed) return [];
        const kind = nodeKindFor(s.type);
        const half = PRINT_NODE_HALF_SIZE[kind];
        return [
          {
            id: s.id,
            type: "compact",
            position: {
              x: WRAPPED_LANE_GUTTER + placed.x - half.x,
              y: placed.y + LANE_TOP_OFFSET - half.y,
            },
            data: {
              label: s.label,
              roleName: s.assignedRole?.name,
              stepNumber: i + 1,
              kind,
              slaDays: s.slaDays,
              threshold: s.threshold,
              direction: s.direction,
              links: s.links.map((l) => ({
                id: l.id,
                targetProcessId: l.targetProcessId,
                code: l.targetProcess.code,
                name: l.targetProcess.name,
              })),
            },
            draggable: false,
            selectable: false,
            zIndex: 1,
          },
        ];
      });

      // A marker directly above its own step, and a short stub beside it. The
      // markers used to sit out at the page edge, a long way from the step
      // they belong to, which is half of why the wrap read as confusing.
      const labelOf = new Map(connections.map((c) => [`${c.fromStepId}->${c.toStepId}`, c.label]));
      const markerNodes: Node[] = crossRowMarkers(wrap, connections).flatMap((marker, i) => {
        const placed = placedById.get(marker.stepId);
        if (!placed) return [];
        const connectionLabel =
          connections.find(
            (c) =>
              (marker.kind === "continues" ? c.fromStepId : c.toStepId) === marker.stepId &&
              labelOf.get(`${c.fromStepId}->${c.toStepId}`)
          )?.label ?? undefined;
        const out = marker.kind === "continues";
        // Measured off the step's own shape, not a fixed offset: a decision is
        // taller than a task, and a marker placed a constant distance above
        // the centre landed inside the diamond.
        const step = steps.find((s) => s.id === marker.stepId);
        const half = PRINT_NODE_HALF_SIZE[step ? nodeKindFor(step.type) : "task"];
        return [
          {
            id: `marker-${marker.kind}-${marker.stepId}-${i}`,
            type: "continuation",
            position: {
              x: WRAPPED_LANE_GUTTER + placed.x - 60,
              y: placed.y + LANE_TOP_OFFSET - half.y - 24,
            },
            data: { kind: marker.kind, otherRow: marker.otherRow, connectionLabel },
            draggable: false,
            selectable: false,
            zIndex: 4,
          },
          {
            id: `stub-${marker.kind}-${marker.stepId}-${i}`,
            type: "linkstub",
            // Ends exactly at the card's edge — the incoming one used to start
            // far enough left to sit on top of the lane name in the gutter.
            position: {
              x: WRAPPED_LANE_GUTTER + placed.x + (out ? half.x + 2 : -half.x - 60),
              y: placed.y + LANE_TOP_OFFSET - 14,
            },
            data: { kind: out ? "out" : "in" },
            draggable: false,
            selectable: false,
            zIndex: 3,
          },
        ];
      });

      return [...furniture, ...rowLaneNodes, ...rowStepNodes, ...markerNodes];
    }

    const laneNodes: Node[] = laneOrder.map((roleId, i) => ({
      id: `lane-${roleId}`,
      type: "lane",
      position: { x: 0, y: i * LANE_HEIGHT + LANE_TOP_OFFSET },
      data: { label: laneLabel.get(roleId) ?? "", tinted: i % 2 === 1 },
      style: { width: canvasWidth, height: LANE_HEIGHT },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
    }));

    // A step with no role at all still gets a lane of its own, exactly like
    // the interactive Process Map — otherwise it has nowhere correct to sit
    // and falls back to its stale stored position instead.
    if (layout.hasUnassignedLane) {
      laneNodes.push({
        id: "lane-unassigned",
        type: "lane",
        position: { x: 0, y: laneOrder.length * LANE_HEIGHT + LANE_TOP_OFFSET },
        data: { label: "Unassigned", tinted: laneOrder.length % 2 === 1 },
        style: { width: canvasWidth, height: LANE_HEIGHT },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
      });
    }

    const stepNodes: Node[] = steps.map((s, i) => {
      const kind = nodeKindFor(s.type);
      const half = HALF_SIZE[kind];
      const links: StepLinkData[] = s.links.map((l) => ({
        id: l.id,
        targetProcessId: l.targetProcessId,
        code: l.targetProcess.code,
        name: l.targetProcess.name,
      }));
      return {
        id: s.id,
        type: kind,
        position: { x: s.positionX - half.x, y: (layout.yOf.get(s.id) ?? s.positionY) - half.y },
        data: {
          label: s.label,
          roleName: s.assignedRole?.name,
          stepNumber: i + 1,
          slaDays: s.slaDays,
          threshold: s.threshold,
          direction: s.direction,
          links,
          workspaceId,
        },
        draggable: false,
        selectable: false,
        zIndex: 1,
      };
    });

    return [...laneNodes, ...stepNodes];
  }, [laneOrder, layout, laneLabel, steps, canvasWidth, workspaceId, wrap, placedById, connections]);

  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  /**
   * The connections the wrap genuinely had to break, so the edge list can skip
   * them. The seam — the step a row ends on to the step the next row begins
   * on — is no longer one of them: serpentine rows put those two in the same
   * column, so the line between them is a short drop that crosses nothing.
   */
  const crossRowIds = useMemo(() => {
    if (!wrap.wrapped) return new Set<string>();
    const rowOf = new Map(wrap.rows.flatMap((r) => r.steps.map((s) => [s.id, r.index])));
    return new Set(
      connections
        .filter((c) => {
          const a = rowOf.get(c.fromStepId);
          const b = rowOf.get(c.toStepId);
          if (a === undefined || b === undefined || a === b) return false;
          return !isSeamConnection(wrap, c);
        })
        .map((c) => c.id)
    );
  }, [connections, wrap]);

  /** The seam connections, which are drawn as the drop from one row to the next. */
  const seamIds = useMemo(() => {
    if (!wrap.wrapped) return new Set<string>();
    return new Set(connections.filter((c) => isSeamConnection(wrap, c)).map((c) => c.id));
  }, [connections, wrap]);

  /**
   * Where every drawn connector should go — the same router the live canvas
   * uses, fed from wherever this diagram actually put the cards.
   *
   * On a wrapped map that is the serpentine placement, at the compact print
   * size; on an unwrapped one it is the stored position and the lane the role
   * puts the step in, at full size. The router is told about all of the cards
   * either way, because its bands and channels are measured from what is on
   * the page, not from what is being connected.
   */
  const routes = useMemo(() => {
    const cards: RoutedStep[] = [];
    for (const s of steps) {
      const kind = nodeKindFor(s.type);
      const placed = placedById.get(s.id);
      if (wrap.wrapped && placed) {
        const half = PRINT_NODE_HALF_SIZE[kind];
        cards.push({
          id: s.id,
          x: WRAPPED_LANE_GUTTER + placed.x,
          y: placed.y + LANE_TOP_OFFSET,
          width: half.x * 2,
          height: half.y * 2,
          shape: kind === "decision" ? "diamond" : "rect",
        });
        continue;
      }
      const half = HALF_SIZE[kind];
      cards.push({
        id: s.id,
        x: s.positionX,
        y: layout.yOf.get(s.id) ?? s.positionY,
        width: half.x * 2,
        height: half.y * 2,
        shape: kind === "decision" ? "diamond" : "rect",
      });
    }
    // Only the connections this diagram draws as lines are routed. The ones
    // the wrap had to break are replaced by a pair of stubs, and the seam is
    // drawn as its own straight drop, so neither should be given a corridor.
    const drawn = connections
      .filter((c) => !crossRowIds.has(c.id) && !seamIds.has(c.id))
      .map((c) => ({ id: c.id, fromStepId: c.fromStepId, toStepId: c.toStepId }));
    return routeConnectors(cards, drawn);
  }, [steps, placedById, wrap, layout, connections, crossRowIds, seamIds]);

  const edges: Edge[] = useMemo(
    () =>
      connections.flatMap((c): Edge[] => {
        const from = stepById.get(c.fromStepId);
        const to = stepById.get(c.toStepId);
        if (!from || !to) return [];
        // A connection whose ends landed on different rows is not drawn as a
        // line: the space it would have to travel through is the next row's
        // swimlanes, so routing around the steps means crossing the lanes
        // instead. It is marked at both ends instead — see crossRowEndpoints.
        if (crossRowIds.has(c.id)) return [];

        // The seam drops straight down a column, and is drawn teal so it reads
        // as the same thing the row label and the rule are: furniture telling
        // you where one row ends and the next begins.
        const isSeam = seamIds.has(c.id);
        if (isSeam) {
          return [
            {
              id: c.id,
              source: c.fromStepId,
              target: c.toStepId,
              sourceHandle: "bottom",
              targetHandle: "top-t",
              label: c.label ?? undefined,
              type: "smoothstep",
              style: { stroke: "#0d9488", strokeWidth: 2.5, vectorEffect: "non-scaling-stroke" },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#0d9488" },
              labelStyle: { fontSize: 10, fontWeight: 700 },
              labelBgStyle: { fill: "#fff" },
              zIndex: 2,
            },
          ];
        }

        // Which side a connector leaves and enters, and whether it reads as a
        // loop, both come from the route — which was computed from where the
        // cards were actually drawn. That matters most on a wrapped map, where
        // a backward row runs right to left and the stored order says the
        // opposite of what the page shows.
        const route = routes.get(c.id);

        // A loop is a connection running against its row's own direction —
        // which on a serpentine map is not the same as running right to left.
        const fromPlaced = placedById.get(c.fromStepId);
        const toPlaced = placedById.get(c.toStepId);
        const backward =
          wrap.wrapped && fromPlaced && toPlaced
            ? wrap.rows[fromPlaced.row]?.direction === "backward"
              ? toPlaced.x > fromPlaced.x
              : toPlaced.x < fromPlaced.x
            : to.positionX < from.positionX;

        return [
          {
            id: c.id,
            source: c.fromStepId,
            target: c.toStepId,
            label: c.label ?? undefined,
            type: "routed",
            data: { route },
            labelStyle: { fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: "#fff" },
            ...edgeAppearance(route, backward),
          },
        ];
      }),
    [connections, stepById, crossRowIds, seamIds, routes, placedById, wrap]
  );


  // Tall enough to give a many-lane process real room, but capped — this is a
  // printed page, not an infinite canvas — clamped between a one-lane minimum
  // and roughly half an A4-landscape page. laneCount includes the Unassigned
  // lane when there is one, so it doesn't get squeezed out of the height
  // this box reserves for it.
  //
  // A wrapped map is drawn one row-group per box rather than all of it in one.
  //
  // The single box was capped at a printable page so a page break could not
  // fall inside it and sever a step card. That kept the cards whole and made
  // the map unreadable instead: a four-row process was scaled to 0.42 and its
  // labels rendered at 3.7px. Capping height and scaling to fit are the same
  // trade, and neither end of it is acceptable.
  //
  // A map is allowed to be taller than a page — it just has to break in a
  // place that costs nothing. Between two rows is such a place: the rows are
  // already separated by a gap and each carries its own lane labels, so a
  // reader losing one to a page boundary loses nothing. Each group is its own
  // block that stays whole, the browser breaks between them, and every card is
  // drawn at full size.
  const rowGroups = useMemo(() => {
    if (!wrap.wrapped) return null;
    const groups: { rows: typeof wrap.rows; top: number; height: number }[] = [];
    let current: typeof wrap.rows = [];
    let top = 0;
    let height = 0;

    for (const row of wrap.rows) {
      // LANE_TOP_OFFSET is the room a row's label and rule need above it.
      const needs = row.height + LANE_TOP_OFFSET + WRAPPED_ROW_GAP;
      if (current.length > 0 && height + needs > MAX_BLOCK_WITH_HEADING_PX) {
        groups.push({ rows: current, top, height });
        top = row.y - LANE_TOP_OFFSET;
        current = [];
        height = 0;
      }
      if (current.length === 0) top = row.y - LANE_TOP_OFFSET;
      current.push(row);
      height += needs;
    }
    if (current.length > 0) groups.push({ rows: current, top, height });
    return groups;
  }, [wrap]);

  /**
   * Where the seam between one row and the next sits horizontally.
   *
   * Serpentine rows share a column at the turn, so this is the x of the last
   * step of the row given — and the first step of the row below it.
   */
  const seamXOf = useCallback(
    (rowIndex: number) => {
      const row = wrap.rows[rowIndex];
      const last = row?.steps[row.steps.length - 1];
      return WRAPPED_LANE_GUTTER + (last?.x ?? 0);
    },
    [wrap]
  );

  /** Which row a node belongs to, from where the layout put it. */
  const rowOfNode = useCallback(
    (y: number) => {
      for (const row of wrap.rows) {
        const from = row.y + LANE_TOP_OFFSET - 60;
        const to = row.y + row.height + LANE_TOP_OFFSET;
        if (y >= from && y <= to) return row.index;
      }
      return -1;
    },
    [wrap]
  );

  const unwrappedHeight = Math.max(320, Math.min(640, layout.laneCount * LANE_HEIGHT + 80));

  if (wrap.wrapped && rowGroups) {
    const nodeRow = new Map(nodes.map((n) => [n.id, rowOfNode(n.position.y)]));

    // One transform for every group, not fitView per group.
    //
    // fitView centres and scales each canvas on its own contents, which means
    // two groups holding different-width rows are drawn at different scales and
    // different offsets — and the serpentine alignment is lost, because a row
    // no longer begins under the step the row above ended on. A shared zoom and
    // a shared x keep the columns lined up down the whole map; each group only
    // differs in the slice of y it shows.
    // The furthest right anything is actually drawn, measured from the nodes
    // themselves — lane bands included, since they define the map's own width.
    const contentWidth = nodes.reduce((widest, n) => {
      const kind = typeof n.type === "string" ? n.type : "";
      const width =
        kind === "compact"
          ? PRINT_NODE_HALF_SIZE[(n.data as { kind?: keyof typeof PRINT_NODE_HALF_SIZE }).kind ?? "task"].x * 2
          : kind === "lane" || kind === "rowrule"
            ? Number(n.style?.width ?? canvasWidth)
            : (NODE_WIDTH[kind] ?? 0);
      return Math.max(widest, n.position.x + width);
      // A few pixels of slack. The widths above are the ones the layout asks
      // for, and a node can render a little past its own box — a link stub was
      // measured three pixels over, which is enough to be clipped.
    }, WRAPPED_LANE_GUTTER + canvasWidth) + EXTENT_SLACK;
    const zoom = Math.min(1, (PAGE_CONTENT_WIDTH_PX - 6) / contentWidth);

    return (
      <div className="flex flex-col gap-2">
        {rowGroups.map((group, i) => {
          const rowIds = new Set(group.rows.map((r) => r.index));
          const groupNodes = nodes.filter((n) => rowIds.has(nodeRow.get(n.id) ?? -1));
          const groupEdges = edges.filter(
            (e) => rowIds.has(nodeRow.get(e.source) ?? -1) && rowIds.has(nodeRow.get(e.target) ?? -1)
          );

          // The box is sized to what this group actually holds, measured the
          // same way its width is. Deriving the height from the row's own
          // geometry instead left a marker sitting above the first lane
          // clipped by the top edge.
          const heightOf = (n: (typeof groupNodes)[number]) => {
            const kind = typeof n.type === "string" ? n.type : "";
            if (kind === "compact") {
              return (
                PRINT_NODE_HALF_SIZE[(n.data as { kind?: keyof typeof PRINT_NODE_HALF_SIZE }).kind ?? "task"].y * 2
              );
            }
            if (kind === "lane") return Number(n.style?.height ?? PRINT_LANE_HEIGHT);
            return NODE_HEIGHT[kind] ?? 0;
          };
          const top = groupNodes.reduce((min, n) => Math.min(min, n.position.y), Infinity);
          const bottom = groupNodes.reduce((max, n) => Math.max(max, n.position.y + heightOf(n)), -Infinity);
          const contentTop = Number.isFinite(top) ? top - EXTENT_SLACK : group.top;
          const contentHeight = Number.isFinite(bottom) ? bottom - contentTop + EXTENT_SLACK : group.height;

          return (
            <div key={`rowgroup-${i}`}>
              <div
                className="print-keep relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
                style={{ height: contentHeight * zoom }}
              >
                <ReactFlowProvider>
                  <ReactFlow
                    nodes={groupNodes}
                    edges={groupEdges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    panOnDrag={false}
                    zoomOnScroll={false}
                    zoomOnPinch={false}
                    zoomOnDoubleClick={false}
                    minZoom={zoom}
                    maxZoom={zoom}
                    defaultViewport={{ x: 3, y: -contentTop * zoom, zoom }}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background gap={20} size={1} color="#e2e8f0" />
                  </ReactFlow>
                </ReactFlowProvider>
              </div>
              {/* The seam. Two rows in one canvas are joined by a drawn line;
                  across two canvases they cannot be, so the drop is drawn
                  between the boxes at the column the rows share. */}
              {i < rowGroups.length - 1 && (
                <div aria-hidden="true" className="relative h-2">
                  <div
                    className="absolute top-0 h-2 border-l-2 border-teal-600"
                    style={{ left: seamXOf(group.rows[group.rows.length - 1]!.index) * zoom }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const diagramHeight = unwrappedHeight;

  return (
    <div
      className="relative w-full break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={{ height: diagramHeight }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          // No pan or zoom is offered here — this is a static, printed
          // rendering, not the interactive Process Map — so the *initial* fit
          // has to show the whole diagram or nothing ever will. The default
          // zoom floor (0.5) refuses to shrink a wide or many-lane process far
          // enough to fit a fixed-height box, silently clipping it instead;
          // both zoom clamps are lowered here so fitView can always reach
          // whatever scale the content actually needs.
          minZoom={0.05}
          fitView
          // The padding is deliberately small. fitView divides the available
          // box by (1 + padding), so every point of it is width the drawing
          // does not get: at 0.12 a map that was otherwise a perfect fit was
          // drawn at 89% of the page and the rest read as wasted margin. The
          // frame's own border and the lane gutter already keep the drawing
          // off the edge, so the breathing room was being paid for twice.
          fitViewOptions={{ padding: 0.03, minZoom: 0.05 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
