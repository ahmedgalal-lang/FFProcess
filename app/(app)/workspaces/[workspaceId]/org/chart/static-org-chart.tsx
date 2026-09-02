import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { layoutOrgChart, CHART_LEVEL_HEIGHT, type ChartPerson } from "@/lib/domain/org-chart";

type PersonNodeData = { name: string; roleNames: string[] };

function StaticPersonNode({ data }: NodeProps & { data: PersonNodeData }) {
  return (
    <div className="w-[168px] rounded-lg border-[1.5px] border-slate-300 bg-white px-3 py-2 text-center shadow-sm">
      <Handle id="top" type="target" position={Position.Top} className="!bg-slate-300" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!bg-slate-300" />
      <div className="truncate text-[12.5px] font-semibold text-slate-900">{data.name}</div>
      {data.roleNames.length > 0 && (
        <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
          {data.roleNames.join(", ")}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { person: StaticPersonNode };

type PersonT = { id: string; name: string; managerId: string | null; roleNames: string[] };

/**
 * A read-only rendering of the Org Chart for the Export Report — same node
 * shapes as the interactive OrgChartCanvas, but with no Controls widget or
 * PNG-export button (both dead weight on a static/printed page), and a lower
 * zoom floor so a chart with many reporting levels can shrink to fit its box
 * instead of being clipped, the same fix already made for the Process Map
 * diagram and for the same reason.
 */
export function StaticOrgChart({ people }: { people: PersonT[] }) {
  const positions = layoutOrgChart(people.map((p): ChartPerson => ({ id: p.id, name: p.name, managerId: p.managerId })));
  const positionById = new Map(positions.map((p) => [p.id, p]));
  const byId = new Map(people.map((p) => [p.id, p]));

  const nodes: Node[] = people.map((p) => {
    const pos = positionById.get(p.id)!;
    return {
      id: p.id,
      type: "person",
      position: { x: pos.x, y: pos.y },
      data: { name: p.name, roleNames: p.roleNames },
      draggable: false,
      selectable: false,
    };
  });

  const edges: Edge[] = people
    .filter((p) => p.managerId && byId.has(p.managerId))
    .map((p) => ({
      id: `${p.managerId}-${p.id}`,
      source: p.managerId!,
      target: p.id,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "smoothstep",
      style: { stroke: "#94a3b8" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
    }));

  // Tall enough to give a many-level chart real room, but capped — same
  // print-page bound the Process Map diagram uses — clamped between a
  // one-level minimum and roughly half an A4-landscape page.
  const maxDepth = positions.reduce((deepest, p) => Math.max(deepest, p.depth), 0);
  const chartHeight = Math.max(280, Math.min(640, (maxDepth + 1) * CHART_LEVEL_HEIGHT + 140));

  return (
    <div
      className="relative w-full break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={{ height: chartHeight }}
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
          // Same reasoning as the Process Map's static diagram: no pan or
          // zoom is offered here, so the initial fit has to show the whole
          // chart or nothing ever will — the default zoom floor can't shrink
          // a many-level chart far enough to fit a fixed-height box.
          minZoom={0.05}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.05 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
