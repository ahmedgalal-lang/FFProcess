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

/** A process that picks up from this step — the other end of a branch link. */
export type StepBranchData = { id: string; code: string; name: string };

export type StepNodeData = {
  label: string;
  roleName?: string;
  links: StepLinkData[];
  branches?: StepBranchData[];
  workspaceId: string;
};

/**
 * Chips under a step: indigo 🔗 for the step's own links out to a process,
 * amber ↳ for processes that branch off this step. Two directions, two
 * colours, so they stay tellable apart at a glance.
 */
function StepChips({ data }: { data: StepNodeData }) {
  const branches = data.branches ?? [];
  if (data.links.length === 0 && branches.length === 0) return null;
  return (
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
      {branches.map((branch) => (
        <Link
          key={branch.id}
          href={`/workspaces/${data.workspaceId}/processes/${branch.id}/map`}
          title={`${branch.name} branches from this step`}
          className="whitespace-nowrap rounded-full border border-dashed border-amber-300 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-700 hover:bg-amber-100"
          onClick={(e) => e.stopPropagation()}
        >
          ↳ {branch.code}
        </Link>
      ))}
    </div>
  );
}

export function TaskNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-14 w-[132px] flex-col items-center justify-center rounded-lg border-[1.5px] border-slate-300 bg-white px-2 text-center shadow-sm">
      <Handles />
      <div className="text-[12px] font-semibold leading-tight text-slate-900">{data.label}</div>
      {data.roleName && (
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{data.roleName}</div>
      )}
      <StepChips data={data} />
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
      <StepChips data={data} />
    </div>
  );
}

export function TerminalNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-9 w-[92px] items-center justify-center rounded-full border-[1.5px] border-slate-300 bg-slate-100 text-center text-[12px] font-semibold text-slate-700">
      <Handles />
      {data.label}
      <StepChips data={data} />
    </div>
  );
}

export type LaneNodeData = { label: string };

export type BranchEntryData = {
  label: string;
  sourceCode: string;
  sourceProcessId: string;
  stepNumber: number;
  workspaceId: string;
};

/**
 * The step in another process that this one picks up from. Sits in its own
 * gutter to the left of the swimlanes rather than in one of them — the step
 * carries the *source* process's role, which usually isn't a lane here.
 * Read-only and not draggable: it belongs to the other process, and its place
 * is derived rather than chosen.
 */
export function BranchEntryNode({ data }: NodeProps & { data: BranchEntryData }) {
  return (
    <Link
      href={`/workspaces/${data.workspaceId}/processes/${data.sourceProcessId}/map`}
      className="flex h-14 w-[150px] flex-col justify-center rounded-lg border-[1.5px] border-dashed border-amber-500 bg-amber-50 px-2.5 no-underline hover:bg-amber-100"
    >
      <Handle id="right" type="source" position={Position.Right} className="!bg-amber-300" />
      <div className="text-[11.5px] font-semibold leading-tight text-amber-700">{data.label}</div>
      <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-amber-700/85">
        {data.sourceCode} · step {data.stepNumber}
      </div>
    </Link>
  );
}

/** Tinted column the branch entry sits in, marking it as not part of this process. */
export function BranchGutterNode({ data }: NodeProps & { data: { label: string } }) {
  return (
    <div className="h-full w-full border-r-[1.5px] border-dashed border-amber-300 bg-amber-50/45 pl-3 pt-2">
      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700/80">{data.label}</span>
    </div>
  );
}

export function LaneNode({ data }: NodeProps & { data: LaneNodeData }) {
  return (
    <div className="flex h-[130px] items-start border-b border-dashed border-slate-200 bg-slate-50/60 pl-3 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{data.label}</span>
    </div>
  );
}
