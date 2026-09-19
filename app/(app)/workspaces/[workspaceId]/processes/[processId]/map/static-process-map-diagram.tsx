"use client";

import { useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, MarkerType, type Node, type Edge } from "@xyflow/react";
import {
  assignSwimlanes,
  crossRowMarkers,
  wrapProcessMap,
  LANE_HEIGHT,
  LANE_TOP_OFFSET,
  NODE_HALF_SIZE,
  PRINT_LANE_HEIGHT,
  PRINT_NODE_HALF_SIZE,
  PRINT_STEP_X_SPACING,
  WRAPPED_LANE_GUTTER,
} from "@/lib/domain/process-layout";
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

const HALF_SIZE = NODE_HALF_SIZE;

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

function chooseHandles(from: StepT, to: StepT) {
  const dx = to.positionX - from.positionX;
  const dy = to.positionY - from.positionY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { sourceHandle: "right", targetHandle: "left-t" } : { sourceHandle: "left", targetHandle: "right-t" };
  }
  return dy >= 0 ? { sourceHandle: "bottom", targetHandle: "top-t" } : { sourceHandle: "top", targetHandle: "bottom-t" };
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
        out.push({
          id: `rowlabel-${row.index}`,
          type: "rowlabel",
          position: { x: WRAPPED_LANE_GUTTER, y: row.y + LANE_TOP_OFFSET - 30 },
          data: {
            row: row.index + 1,
            of: wrap.rows.length,
            firstStep: stepNumberOf(row.steps[0]?.id),
            lastStep: stepNumberOf(row.steps[row.steps.length - 1]?.id),
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

  /** The connections the wrap had to break, so the edge list can skip them. */
  const crossRowIds = useMemo(() => {
    if (!wrap.wrapped) return new Set<string>();
    const rowOf = new Map(wrap.rows.flatMap((r) => r.steps.map((s) => [s.id, r.index])));
    return new Set(
      connections
        .filter((c) => {
          const a = rowOf.get(c.fromStepId);
          const b = rowOf.get(c.toStepId);
          return a !== undefined && b !== undefined && a !== b;
        })
        .map((c) => c.id)
    );
  }, [connections, wrap]);

  const edges: Edge[] = useMemo(
    () =>
      connections.flatMap((c) => {
        const from = stepById.get(c.fromStepId);
        const to = stepById.get(c.toStepId);
        if (!from || !to) return [];
        // A connection whose ends landed on different rows is not drawn as a
        // line: the space it would have to travel through is the next row's
        // swimlanes, so routing around the steps means crossing the lanes
        // instead. It is marked at both ends instead — see crossRowEndpoints.
        if (crossRowIds.has(c.id)) return [];
        const isLoop = to.positionX < from.positionX;
        const { sourceHandle, targetHandle } = chooseHandles(from, to);
        return [
          {
            id: c.id,
            source: c.fromStepId,
            target: c.toStepId,
            sourceHandle,
            targetHandle,
            label: c.label ?? undefined,
            type: "smoothstep",
            style: isLoop
              ? { stroke: "#d97706", strokeWidth: 2, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke" }
              : { stroke: "#64748b", strokeWidth: 2, vectorEffect: "non-scaling-stroke" },
            markerEnd: { type: MarkerType.ArrowClosed, color: isLoop ? "#d97706" : "#64748b" },
            labelStyle: { fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: "#fff" },
          },
        ];
      }),
    [connections, stepById, crossRowIds]
  );


  // Tall enough to give a many-lane process real room, but capped — this is a
  // printed page, not an infinite canvas — clamped between a one-lane minimum
  // and roughly half an A4-landscape page. laneCount includes the Unassigned
  // lane when there is one, so it doesn't get squeezed out of the height
  // this box reserves for it.
  // A wrapped map needs room for every row, so the box grows with them — up to
  // a cap, past which it falls back to shrinking one rendering to fit, which is
  // what this did for everything before. Completeness is never traded for
  // legibility: a shrunk map is worse, a map missing a row is wrong.
  const MAX_DIAGRAM_HEIGHT = 1500;
  const diagramHeight = wrap.wrapped
    ? Math.max(320, Math.min(MAX_DIAGRAM_HEIGHT, wrap.height + 80))
    : Math.max(320, Math.min(640, layout.laneCount * LANE_HEIGHT + 80));

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
