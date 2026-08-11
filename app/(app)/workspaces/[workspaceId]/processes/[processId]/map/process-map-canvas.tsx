"use client";

import { useCallback, useMemo, useState } from "react";
import { toPng } from "html-to-image";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  MarkerType,
  applyEdgeChanges,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodeDrag,
  type OnConnect,
  type OnEdgesChange,
} from "@xyflow/react";
import { updateStepPosition, createStepConnection, deleteStepConnection } from "@/lib/actions/process";
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

const STEP_TYPE_LABEL: Record<StepT["type"], string> = {
  START: "Start",
  TASK: "Task",
  DECISION: "Decision",
  END: "End",
};

function describeStep(s: StepT): string {
  const parts = [`${STEP_TYPE_LABEL[s.type]} step: ${s.label}`];
  if (s.assignedRole) parts.push(`assigned to ${s.assignedRole.name}`);
  if (s.links.length > 0) {
    parts.push(`linked to ${s.links.map((l) => l.targetProcess.code).join(", ")}`);
  }
  return parts.join(", ");
}

/** Picks handle ids on each side based on the geometric relationship between two steps. */
function chooseHandles(from: StepT, to: StepT) {
  const dx = to.positionX - from.positionX;
  const dy = to.positionY - from.positionY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { sourceHandle: "right", targetHandle: "left-t" } : { sourceHandle: "left", targetHandle: "right-t" };
  }
  return dy >= 0 ? { sourceHandle: "bottom", targetHandle: "top-t" } : { sourceHandle: "top", targetHandle: "bottom-t" };
}

export function ProcessMapCanvas({
  workspaceId,
  processId,
  processCode,
  steps,
  connections,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
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

  const initialNodes: Node[] = useMemo(() => {
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
        ariaLabel: describeStep(s),
        zIndex: 1,
      };
    });

    return [...laneNodes, ...stepNodes];
  }, [laneOrder, laneLabel, steps, canvasWidth, workspaceId]);

  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const buildEdge = useCallback(
    (id: string, fromStepId: string, toStepId: string, label: string | null): Edge | null => {
      const from = stepById.get(fromStepId);
      const to = stepById.get(toStepId);
      if (!from || !to) return null;
      const isLoop = to.positionX < from.positionX;
      const { sourceHandle, targetHandle } = chooseHandles(from, to);
      return {
        id,
        source: fromStepId,
        target: toStepId,
        sourceHandle,
        targetHandle,
        label: label ?? undefined,
        ariaLabel: `Connector from ${from.label} to ${to.label}${label ? `, labeled ${label}` : ""}`,
        type: "smoothstep",
        animated: false,
        style: isLoop ? { stroke: "#d97706", strokeDasharray: "4 3" } : { stroke: "#94a3b8" },
        markerEnd: { type: MarkerType.ArrowClosed, color: isLoop ? "#d97706" : "#94a3b8" },
        labelStyle: { fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: "#fff" },
      };
    },
    [stepById]
  );

  const initialEdges: Edge[] = useMemo(
    () => connections.flatMap((c) => buildEdge(c.id, c.fromStepId, c.toStepId, c.label) ?? []),
    [connections, buildEdge]
  );

  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [saving, setSaving] = useState(false);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      setSaving(true);
      createStepConnection({
        workspaceId,
        processId,
        fromStepId: connection.source,
        toStepId: connection.target,
      })
        .then((result) => {
          if (!result.ok) return;
          const edge = buildEdge(result.data.id, connection.source!, connection.target!, null);
          if (edge) setEdges((eds) => [...eds, edge]);
        })
        .finally(() => setSaving(false));
    },
    [workspaceId, processId, buildEdge]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      for (const change of changes) {
        if (change.type === "remove") {
          setSaving(true);
          deleteStepConnection({ workspaceId, processId, connectionId: change.id }).finally(() => setSaving(false));
        }
      }
    },
    [workspaceId, processId]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      if (node.type === "lane") return;
      const kind = node.type as keyof typeof HALF_SIZE;
      const half = HALF_SIZE[kind];
      const centerX = Math.round(node.position.x + half.x);
      const centerY = Math.round(node.position.y + half.y);
      setSaving(true);
      updateStepPosition({ workspaceId, processId, stepId: node.id, positionX: centerX, positionY: centerY }).finally(
        () => setSaving(false)
      );
    },
    [workspaceId, processId]
  );

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      {saving && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">
          Saving…
        </span>
      )}
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) =>
            setNodes((nds) => {
              const next = [...nds];
              for (const change of changes) {
                if (change.type === "position" && change.position) {
                  const idx = next.findIndex((n) => n.id === change.id);
                  if (idx !== -1) next[idx] = { ...next[idx], position: change.position };
                }
              }
              return next;
            })
          }
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          deleteKeyCode={["Backspace", "Delete"]}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.4}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <ExportPngButton processCode={processCode} />
          </Panel>
          <Panel position="bottom-left">
            <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
              Drag a node edge to connect steps · select a connector + Delete to remove it
            </span>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function ExportPngButton({ processCode }: { processCode: string }) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(() => {
    const nodes = getNodes();
    const bounds = getNodesBounds(nodes);
    const width = 1600;
    const height = 900;
    const viewport = getViewportForBounds(bounds, width, height, 0.2, 2, 0.15);
    const el = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!el) return;

    setExporting(true);
    toPng(el, {
      backgroundColor: "#ffffff",
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    })
      .then((dataUrl) => {
        const a = document.createElement("a");
        a.download = `${processCode}-process-map.png`;
        a.href = dataUrl;
        a.click();
      })
      .finally(() => setExporting(false));
  }, [getNodes, processCode]);

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={exporting}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
    >
      {exporting ? "Exporting…" : "⬇ PNG"}
    </button>
  );
}
