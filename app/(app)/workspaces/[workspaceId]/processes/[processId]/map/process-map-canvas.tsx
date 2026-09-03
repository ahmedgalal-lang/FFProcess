"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  assignSwimlanes,
  laneIndexAtY,
  roleIdForLane,
  LANE_HEIGHT,
  LANE_NODE_Y_OFFSET,
  LANE_TOP_OFFSET,
  NODE_HALF_SIZE,
} from "@/lib/domain/process-layout";
import type { AuthorityDirection } from "@/lib/domain/authority-table";
import {
  TaskNode,
  DecisionNode,
  TerminalNode,
  LaneNode,
  BranchEntryNode,
  BranchGutterNode,
  type StepLinkData,
} from "./map-nodes";

const NODE_TYPES = {
  task: TaskNode,
  decision: DecisionNode,
  terminal: TerminalNode,
  lane: LaneNode,
  branchEntry: BranchEntryNode,
  branchGutter: BranchGutterNode,
};

/** Matches FIRST_STEP_X in lib/domain/process-layout, so the gutter never covers a step. */
const BRANCH_GUTTER_WIDTH = 200;

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
  branches?: { id: string; code: string; name: string }[];
  slaDays?: number | null;
  threshold?: number | null;
  direction?: AuthorityDirection;
};

type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };

/** Where this process picks up, when it resumes mid-flow in another one. */
export type BranchFromT = {
  stepId: string;
  stepLabel: string;
  stepNumber: number;
  sourceProcessId: string;
  sourceProcessCode: string;
};

function nodeKindFor(type: StepT["type"]): keyof typeof HALF_SIZE {
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
function chooseHandles(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
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
  branchFrom,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
  steps: StepT[];
  connections: ConnectionT[];
  branchFrom?: BranchFromT | null;
}) {
  // Lanes and node placement come from the same answer, so a step is always
  // drawn in the lane its role says it belongs to. Its stored positionY is
  // deliberately not used: it was frozen when the step was created, so a role
  // assigned afterwards left the node behind in the wrong lane.
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
  const { laneOrder } = layout;

  const laneLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of steps) {
      const role = s.swimlaneRole ?? s.assignedRole;
      if (role) map.set(role.id, role.name);
    }
    return map;
  }, [steps]);

  const canvasWidth = Math.max(...steps.map((s) => s.positionX), 400) + 260;
  // Grows with the lane count instead of a fixed height — a process with
  // more lanes (or bigger cards) gets the room it needs rather than being
  // squeezed to fit a box sized for however many lanes a different process has.
  const canvasHeight = Math.max(layout.laneCount, 1) * LANE_HEIGHT + LANE_TOP_OFFSET;

  const initialNodes: Node[] = useMemo(() => {
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

    // Steps with no role at all get a lane of their own rather than floating
    // below the diagram in no lane, which is what used to happen.
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
          branches: s.branches ?? [],
          workspaceId,
        },
        ariaLabel: describeStep(s),
        zIndex: 1,
      };
    });

    if (!branchFrom) return [...laneNodes, ...stepNodes];

    const branchNodes: Node[] = [
      {
        id: "branch-gutter",
        type: "branchGutter",
        position: { x: 0, y: 0 },
        data: { label: `↰ From ${branchFrom.sourceProcessCode}` },
        style: { width: BRANCH_GUTTER_WIDTH, height: canvasHeight },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
      },
      {
        id: "branch-entry",
        type: "branchEntry",
        position: { x: 22, y: 77 },
        data: {
          label: branchFrom.stepLabel,
          sourceCode: branchFrom.sourceProcessCode,
          sourceProcessId: branchFrom.sourceProcessId,
          stepNumber: branchFrom.stepNumber,
          workspaceId,
        },
        ariaLabel: `Inherited entry point: ${branchFrom.stepLabel}, step ${branchFrom.stepNumber} of ${branchFrom.sourceProcessCode}`,
        draggable: false,
        zIndex: 1,
      },
    ];

    return [...laneNodes, ...branchNodes, ...stepNodes];
  }, [laneOrder, layout, laneLabel, steps, canvasWidth, canvasHeight, workspaceId, branchFrom]);

  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const buildEdge = useCallback(
    (id: string, fromStepId: string, toStepId: string, label: string | null): Edge | null => {
      const from = stepById.get(fromStepId);
      const to = stepById.get(toStepId);
      if (!from || !to) return null;
      const isLoop = to.positionX < from.positionX;
      const { sourceHandle, targetHandle } = chooseHandles(
        { x: from.positionX, y: layout.yOf.get(from.id) ?? from.positionY },
        { x: to.positionX, y: layout.yOf.get(to.id) ?? to.positionY }
      );
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
    [stepById, layout]
  );

  const initialEdges: Edge[] = useMemo(() => {
    const stepEdges = connections.flatMap((c) => buildEdge(c.id, c.fromStepId, c.toStepId, c.label) ?? []);
    if (!branchFrom) return stepEdges;

    // Draw the inherited entry into this process's own entry points — the
    // steps nothing here feeds — rather than guessing a single "first" step.
    const hasIncoming = new Set(connections.map((c) => c.toStepId));
    const entryEdges: Edge[] = steps
      .filter((s) => !hasIncoming.has(s.id))
      .map((s) => ({
        id: `branch-entry-${s.id}`,
        source: "branch-entry",
        target: s.id,
        sourceHandle: "right",
        targetHandle: "left-t",
        type: "smoothstep",
        deletable: false,
        ariaLabel: `Picks up from ${branchFrom.stepLabel} in ${branchFrom.sourceProcessCode}`,
        style: { stroke: "#b45309", strokeDasharray: "5 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#b45309" },
      }));
    return [...stepEdges, ...entryEdges];
  }, [connections, buildEdge, branchFrom, steps]);

  const router = useRouter();
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
      if (node.type === "lane" || node.type === "branchEntry" || node.type === "branchGutter") return;
      const kind = node.type as keyof typeof HALF_SIZE;
      const half = HALF_SIZE[kind];
      const centerX = Math.round(node.position.x + half.x);
      const centerY = Math.round(node.position.y + half.y);

      // Vertical position isn't free — it *is* the lane. Where a node is
      // dropped decides which lane it joins, and joining a lane means taking
      // that lane's role, which is what puts it there on the next render.
      const laneIndex = laneIndexAtY(centerY, layout.laneCount);
      const droppedRoleId = roleIdForLane(laneIndex, laneOrder);
      const currentLane = layout.laneIndexOf.get(node.id);

      setSaving(true);
      updateStepPosition({
        workspaceId,
        processId,
        stepId: node.id,
        positionX: centerX,
        positionY: laneIndex * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET,
        ...(laneIndex === currentLane ? {} : { swimlaneRoleId: droppedRoleId ?? "" }),
      })
        .then((result) => {
          if (result.ok && laneIndex !== currentLane) router.refresh();
        })
        .finally(() => setSaving(false));
    },
    [workspaceId, processId, layout, laneOrder, router]
  );

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={{ height: canvasHeight }}
    >
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
          fitViewOptions={{ padding: 0.1, minZoom: 0.1 }}
          minZoom={0.1}
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
