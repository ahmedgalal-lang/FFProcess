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
  type Node,
  type Edge,
} from "@xyflow/react";
import { buildProcessLandscape, type LandscapeInput } from "@/lib/domain/process-landscape";
import { ProcessCardNode, type ProcessCardData } from "./landscape-nodes";

const NODE_TYPES = { processCard: ProcessCardNode };

const BRANCH_COLOR = "#b45309"; // amber-700 — matches the branch chips on a Process Map
const LINK_COLOR = "#4f46e5"; // indigo-600 — matches the 🔗 step-link chips

export type LandscapeProcessInput = LandscapeInput & {
  /** Code of the process this one branches from, for the card's own label. */
  branchFromCode: string | null;
};

export function ProcessLandscapeCanvas({
  workspaceId,
  workspaceName,
  processes,
}: {
  workspaceId: string;
  workspaceName: string;
  processes: LandscapeProcessInput[];
}) {
  const landscape = useMemo(() => buildProcessLandscape(processes), [processes]);

  const columnOf = useMemo(
    () => new Map(landscape.nodes.map((n) => [n.process.id, n.column])),
    [landscape]
  );

  const byId = useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes]);

  const nodes: Node[] = useMemo(
    () =>
      landscape.nodes.map((node) => {
        const source = byId.get(node.process.id);
        const data: ProcessCardData = {
          workspaceId,
          processId: node.process.id,
          code: node.process.code,
          name: node.process.name,
          stepCount: node.process.stepCount,
          parentCode: node.process.parentCode,
          branchFrom:
            node.process.branchFrom && source?.branchFromCode
              ? {
                  sourceCode: source.branchFromCode,
                  stepLabel: node.process.branchFrom.stepLabel,
                  stepNumber: node.process.branchFrom.stepNumber,
                }
              : null,
        };
        return {
          id: node.process.id,
          type: "processCard",
          position: { x: node.x, y: node.y },
          data,
          ariaLabel: `${node.process.code} ${node.process.name}, ${node.process.stepCount} steps`,
        };
      }),
    [landscape, byId, workspaceId]
  );

  const edges: Edge[] = useMemo(
    () =>
      landscape.edges.map((edge) => {
        const forward = (columnOf.get(edge.toProcessId) ?? 0) > (columnOf.get(edge.fromProcessId) ?? 0);
        const isBranch = edge.kind === "branch";
        const color = isBranch ? BRANCH_COLOR : LINK_COLOR;
        return {
          id: edge.id,
          source: edge.fromProcessId,
          target: edge.toProcessId,
          sourceHandle: forward ? "right" : "left",
          targetHandle: forward ? "left-t" : "right-t",
          type: "smoothstep",
          label: edge.label,
          ariaLabel: edge.description,
          deletable: false,
          style: { stroke: color, ...(isBranch ? { strokeDasharray: "5 4" } : {}) },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          labelStyle: { fontSize: 10, fontWeight: 700, fill: color },
          labelBgStyle: { fill: "#fff" },
          labelBgPadding: [3, 1] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [landscape, columnOf]
  );

  if (processes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">
        No processes yet — map one and it will appear here.
      </p>
    );
  }

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <ExportPngButton workspaceName={workspaceName} />
          </Panel>
          <Panel position="bottom-left">
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: BRANCH_COLOR }} />
                branches from — picks up mid-flow
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-0 w-5 border-t-2" style={{ borderColor: LINK_COLOR }} />
                step link — hands off to
              </span>
              <span>Drag to rearrange for an export; the layout isn&apos;t saved.</span>
            </div>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function ExportPngButton({ workspaceName }: { workspaceName: string }) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(() => {
    const bounds = getNodesBounds(getNodes());
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
        a.download = `${workspaceName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-helicopter-view.png`;
        a.href = dataUrl;
        a.click();
      })
      .finally(() => setExporting(false));
  }, [getNodes, workspaceName]);

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
