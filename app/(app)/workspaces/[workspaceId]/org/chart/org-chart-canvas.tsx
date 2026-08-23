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
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { layoutOrgChart, type ChartPerson } from "@/lib/domain/org-chart";

const NODE_WIDTH = 168;
const NODE_HEIGHT = 62;

type PersonNodeData = { name: string; roleNames: string[] };

function PersonNode({ data }: NodeProps & { data: PersonNodeData }) {
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

const NODE_TYPES = { person: PersonNode };

type PersonT = { id: string; name: string; managerId: string | null; roleNames: string[] };

export function OrgChartCanvas({ people }: { people: PersonT[] }) {
  const positions = useMemo(
    () => layoutOrgChart(people.map((p): ChartPerson => ({ id: p.id, name: p.name, managerId: p.managerId }))),
    [people]
  );
  const positionById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const nodes: Node[] = useMemo(
    () =>
      people.map((p) => {
        const pos = positionById.get(p.id)!;
        return {
          id: p.id,
          type: "person",
          position: { x: pos.x, y: pos.y },
          data: { name: p.name, roleNames: p.roleNames },
          ariaLabel: `${p.name}${p.roleNames.length ? `, ${p.roleNames.join(", ")}` : ""}`,
        };
      }),
    [people, positionById]
  );

  const edges: Edge[] = useMemo(
    () =>
      people
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
          ariaLabel: `${byId.get(p.managerId!)!.name} manages ${p.name}`,
        })),
    [people, byId]
  );

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <ExportPngButton />
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function ExportPngButton() {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(() => {
    const nodes = getNodes();
    const bounds = getNodesBounds(nodes);
    const width = Math.max(1200, bounds.width + NODE_WIDTH);
    const height = Math.max(700, bounds.height + NODE_HEIGHT * 2);
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
        a.download = "org-chart.png";
        a.href = dataUrl;
        a.click();
      })
      .finally(() => setExporting(false));
  }, [getNodes]);

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
