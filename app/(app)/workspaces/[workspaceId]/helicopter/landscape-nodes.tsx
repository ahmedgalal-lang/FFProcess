"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type ProcessCardData = {
  workspaceId: string;
  processId: string;
  code: string;
  name: string;
  stepCount: number;
  parentCode: string | null;
  branchFrom: { sourceCode: string; stepLabel: string; stepNumber: number } | null;
};

/**
 * Left and right handles each do double duty as source and target — the canvas
 * picks which to wire based on which way the connector runs, so a link that
 * loops back leaves the left side rather than crossing over the card.
 */
function Handles() {
  return (
    <>
      <Handle id="left" type="source" position={Position.Left} className="!bg-slate-300" />
      <Handle id="left-t" type="target" position={Position.Left} className="!bg-slate-300" />
      <Handle id="right" type="source" position={Position.Right} className="!bg-slate-300" />
      <Handle id="right-t" type="target" position={Position.Right} className="!bg-slate-300" />
    </>
  );
}

/** A whole process as one card — the unit this view is drawn in. */
export function ProcessCardNode({ data }: NodeProps & { data: ProcessCardData }) {
  return (
    <div
      className={`relative w-[210px] rounded-xl border-[1.5px] bg-white px-3 py-2.5 shadow-sm ${
        data.branchFrom ? "border-dashed border-amber-400" : "border-slate-300"
      }`}
    >
      <Handles />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{data.code}</span>
        <span className="flex-none rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold text-slate-600">
          {data.stepCount} {data.stepCount === 1 ? "step" : "steps"}
        </span>
      </div>
      <Link
        href={`/workspaces/${data.workspaceId}/processes/${data.processId}/map`}
        className="mt-0.5 block text-[13px] font-semibold leading-tight text-slate-900 hover:underline"
      >
        {data.name}
      </Link>
      {data.parentCode && (
        <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-600">
          under {data.parentCode}
        </div>
      )}
      {data.branchFrom && (
        <div
          className="mt-1 truncate rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
          title={`Picks up from step ${data.branchFrom.stepNumber}, ${data.branchFrom.stepLabel}, of ${data.branchFrom.sourceCode}`}
        >
          ↰ from {data.branchFrom.sourceCode} · step {data.branchFrom.stepNumber}
        </div>
      )}
    </div>
  );
}
