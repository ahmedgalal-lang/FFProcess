"use client";

import { useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, MarkerType, type Node, type Edge } from "@xyflow/react";
import { TaskNode, DecisionNode, TerminalNode, LaneNode, type StepLinkData } from "./map-nodes";

const NODE_TYPES = { task: TaskNode, decision: DecisionNode, terminal: TerminalNode, lane: LaneNode };

const HALF_SIZE: Record<string, { x: number; y: number }> = {
  task: { x: 66, y: 28 },
  decision: { x: 48, y: 48 },
  terminal: { x: 46, y: 19 },
};

type StepT = {
  id: string;
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  positionX: number;
  positionY: number;
  assignedRole: { id: string; name: string } | null;
  swimlaneRole: { id: string; name: string } | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
};

type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };

function nodeKindFor(type: StepT["type"]): keyof typeof NODE_TYPES {
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
  const laneOrder = useMemo(() => {
    const order: string[] = [];
    for (const s of steps) {
      const roleId = s.swimlaneRole?.id ?? s.assignedRole?.id;
      if (roleId && !order.includes(roleId)) order.push(roleId);
    }
    return order;
  }, [steps]);

  const laneLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of steps) {
      const role = s.swimlaneRole ?? s.assignedRole;
      if (role) map.set(role.id, role.name);
    }
    return map;
  }, [steps]);

  const canvasWidth = Math.max(...steps.map((s) => s.positionX), 400) + 260;

  const nodes: Node[] = useMemo(() => {
    const laneNodes: Node[] = laneOrder.map((roleId, i) => ({
      id: `lane-${roleId}`,
      type: "lane",
      position: { x: 0, y: i * 130 + 40 },
      data: { label: laneLabel.get(roleId) ?? "" },
      style: { width: canvasWidth, height: 130 },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
    }));

    const stepNodes: Node[] = steps.map((s) => {
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
        position: { x: s.positionX - half.x, y: s.positionY - half.y },
        data: { label: s.label, roleName: s.assignedRole?.name, links, workspaceId },
        draggable: false,
        selectable: false,
        zIndex: 1,
      };
    });

    return [...laneNodes, ...stepNodes];
  }, [laneOrder, laneLabel, steps, canvasWidth, workspaceId]);

  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const edges: Edge[] = useMemo(
    () =>
      connections.flatMap((c) => {
        const from = stepById.get(c.fromStepId);
        const to = stepById.get(c.toStepId);
        if (!from || !to) return [];
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
            style: isLoop ? { stroke: "#d97706", strokeDasharray: "4 3" } : { stroke: "#94a3b8" },
            markerEnd: { type: MarkerType.ArrowClosed, color: isLoop ? "#d97706" : "#94a3b8" },
            labelStyle: { fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: "#fff" },
          },
        ];
      }),
    [connections, stepById]
  );

  // Tall enough to give a many-lane process real room, but capped — this is a
  // printed page, not an infinite canvas — clamped between a one-lane minimum
  // and roughly half an A4-landscape page.
  const diagramHeight = Math.max(320, Math.min(640, laneOrder.length * 130 + 80));

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
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
          fitViewOptions={{ padding: 0.12, minZoom: 0.05 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
