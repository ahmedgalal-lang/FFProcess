"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DIRECTION_LABELS, formatMoney, type AuthorityDirection } from "@/lib/domain/authority-table";

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
  /** 1-based position in the process's own Steps List — the card's number badge. */
  stepNumber?: number;
  /** Turnaround target in days, when one is set on this step's Authority data. */
  slaDays?: number | null;
  /** Approval threshold + comparison, when this step (usually a decision) has one. */
  threshold?: number | null;
  direction?: AuthorityDirection;
  links: StepLinkData[];
  branches?: StepBranchData[];
  workspaceId: string;
};

/**
 * The meta row on a task card: an SLA chip when one is set, a hand-off chip
 * per process this step links out to, a branch chip per process that picks
 * up from this step — or, when none of those apply, a plain "no SLA set"
 * chip, so the row never reads as an accidentally empty gap.
 */
function MetaChips({ data }: { data: StepNodeData }) {
  const branches = data.branches ?? [];
  const hasAny = data.slaDays != null || data.links.length > 0 || branches.length > 0;

  return (
    <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
      {data.slaDays != null && (
        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-emerald-700">
          SLA {data.slaDays}d
        </span>
      )}
      {data.links.map((link) => (
        <Link
          key={link.id}
          href={`/workspaces/${data.workspaceId}/processes/${link.targetProcessId}/map`}
          className="rounded-full bg-indigo-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-indigo-700 hover:bg-indigo-100"
          onClick={(e) => e.stopPropagation()}
        >
          → {link.code}
        </Link>
      ))}
      {branches.map((branch) => (
        <Link
          key={branch.id}
          href={`/workspaces/${data.workspaceId}/processes/${branch.id}/map`}
          title={`${branch.name} branches from this step`}
          className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-700 hover:bg-amber-100"
          onClick={(e) => e.stopPropagation()}
        >
          ↳ {branch.code}
        </Link>
      ))}
      {!hasAny && (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-500">
          no SLA set
        </span>
      )}
    </div>
  );
}

export function TaskNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex min-h-28 w-[214px] flex-col rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-md">
      <Handles />
      <div className="flex items-start gap-2">
        {data.stepNumber != null && (
          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md bg-indigo-600 font-mono text-[11px] font-bold text-white">
            {data.stepNumber}
          </span>
        )}
        <span className="text-[14.5px] font-semibold leading-tight text-slate-900">{data.label}</span>
      </div>
      {data.roleName && (
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{data.roleName}</div>
      )}
      <MetaChips data={data} />
    </div>
  );
}

/** A step's approval gate, in plain words — "At or above $10,000 · Yes / No". */
function gateLine(threshold: number | null | undefined, direction: AuthorityDirection | undefined): string | null {
  if (threshold == null) return null;
  const label = DIRECTION_LABELS[direction ?? "GREATER_THAN"].label;
  return `${label} ${formatMoney(threshold)} · Yes / No`;
}

export function DecisionNode({ data }: NodeProps & { data: StepNodeData }) {
  const gate = gateLine(data.threshold, data.direction);
  return (
    <div className="relative flex min-h-[92px] w-[176px] flex-col justify-center gap-1 rounded-xl border-[1.5px] border-amber-400 bg-amber-50 px-3.5 py-3 shadow-sm">
      <Handles />
      <div className="text-[14px] font-semibold leading-tight text-amber-900">{data.label}</div>
      {data.roleName && (
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">{data.roleName}</div>
      )}
      {gate && <div className="font-mono text-[9.5px] font-bold text-amber-700">{gate}</div>}
    </div>
  );
}

export function TerminalNode({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <div className="relative flex h-[54px] w-[126px] items-center justify-center rounded-full border-[1.5px] border-emerald-400 bg-emerald-50 text-center text-[14.5px] font-bold text-emerald-700">
      <Handles />
      {data.label}
    </div>
  );
}

export type LaneNodeData = { label: string; tinted?: boolean };

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
      <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-amber-800">
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
    <div
      className={`flex h-full items-start border-b border-dashed border-slate-200 pl-4 pt-2.5 ${
        data.tinted ? "bg-slate-50/70" : "bg-white"
      }`}
    >
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{data.label}</span>
    </div>
  );
}
