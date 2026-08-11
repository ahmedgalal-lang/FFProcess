"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";

// One handle per side, doing double duty as both a source and a target — the
// canvas picks which id to wire an edge to based on the geometric relationship
// between the two steps (see chooseHandles in process-map-canvas.tsx).
function Handles() {
  return (
    <>
      <Handle id="top" type="source" position={Position.Top} className="!bg-slate-300" />
      <Handle id="top-t" type="target" position={Position.Top} className="!bg-slate-300" />
      <Handle id="right" type="source" position={Position.Right} className="!bg-slate-300" />
      <Handle id="right-t" type="target" position={Position.Right} className="!bg-slate-300" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!bg-slate-300" />
      <Handle id="bottom-t" type="target" position={Position.Bottom} className="!bg-slate-300" />
      <Handle id="left" type="source" position={Position.Left} className="!bg-slate-300" />
      <Handle id="left-t" type="target" position={Position.Left} className="!bg-slate-300" />
    </>
  );
}

export type StepLinkData = { id: string; targetProcessId: string; code: string; name: string };

export type StepNodeData = {
  label: string;
  roleName?: string;
  links: StepLinkData[];
  workspaceId: string;
};

export function TaskNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-14 w-[132px] flex-col items-center justify-center rounded-lg border-[1.5px] border-slate-300 bg-white px-2 text-center shadow-sm">
      <Handles />
      <div className="text-[12px] font-semibold leading-tight text-slate-900">{data.label}</div>
      {data.roleName && (
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{data.roleName}</div>
      )}
      {data.links.length > 0 && (
        <div className="absolute -bottom-6 flex flex-col items-center gap-0.5">
          {data.links.map((link) => (
            <Link
              key={link.id}
              href={`/workspaces/${data.workspaceId}/processes/${link.targetProcessId}/map`}
              className="whitespace-nowrap rounded-full border border-dashed border-indigo-300 bg-white px-1.5 py-px text-[9px] font-semibold text-indigo-700 hover:bg-indigo-50"
              onClick={(e) => e.stopPropagation()}
            >
              🔗 {link.code}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function DecisionNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <Handles />
      <div className="flex h-[68px] w-[68px] rotate-45 items-center justify-center rounded-md border-[1.5px] border-indigo-300 bg-indigo-50">
        <div className="-rotate-45 px-1 text-center text-[10px] font-semibold leading-tight text-indigo-700">
          {data.label}
        </div>
      </div>
    </div>
  );
}

export function TerminalNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-9 w-[92px] items-center justify-center rounded-full border-[1.5px] border-slate-300 bg-slate-100 text-center text-[12px] font-semibold text-slate-700">
      <Handles />
      {data.label}
    </div>
  );
}

export type LaneNodeData = { label: string };

export function LaneNode({ data }: NodeProps & { data: LaneNodeData }) {
  return (
    <div className="flex h-[130px] items-start border-b border-dashed border-slate-200 bg-slate-50/60 pl-3 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{data.label}</span>
    </div>
  );
}
