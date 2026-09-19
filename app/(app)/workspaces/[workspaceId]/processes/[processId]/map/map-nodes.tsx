"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { gateLine, type AuthorityDirection } from "@/lib/domain/authority-table";
import {
  DECISION_TEXT_INSET,
  NODE_HALF_SIZE,
  PRINT_NODE_HALF_SIZE,
  shortRoleName,
} from "@/lib/domain/process-layout";

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

/**
 * A decision, drawn as a real flowchart diamond rather than a coloured box.
 *
 * The shape is the notation: a rhombus means "this is where the flow splits",
 * which a rectangle does not, however it is coloured. Drawn as an inline SVG
 * polygon rather than a rotated div so the label stays upright and laid out
 * normally, and so the outline survives print — a CSS clip-path would cut the
 * border off with the corners and leave the diamond edgeless on paper.
 *
 * DECISION_TEXT_INSET is why the box is bigger than the old one: the usable
 * area inside a diamond is only about a quarter of its bounding box, so the
 * same label needs roughly twice the box to sit in.
 */
export function DecisionNode({ data }: NodeProps & { data: StepNodeData }) {
  const gate = gateLine(data.threshold, data.direction);
  const { x: hx, y: hy } = NODE_HALF_SIZE.decision;
  const w = hx * 2;
  const h = hy * 2;

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <Handles />
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        {/* vectorEffect for the same reason as the connector edges: React Flow
            zooms the whole canvas out to fit a wide process, and a stroke that
            scales with it thins to nothing at that zoom. */}
        <polygon
          points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`}
          fill="#fffbeb"
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center"
        style={{ width: w * DECISION_TEXT_INSET, maxHeight: h * DECISION_TEXT_INSET }}
      >
        <div className="text-[13px] font-semibold leading-tight text-amber-900">{data.label}</div>
        {data.roleName && (
          <div className="text-[9px] font-bold uppercase leading-tight tracking-wide text-amber-800">
            {data.roleName}
          </div>
        )}
        {gate && <div className="font-mono text-[9px] font-bold leading-tight text-amber-700">{gate}</div>}
      </div>
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

export type LaneNodeData = { label: string; tinted?: boolean; gutter?: number };

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
  // Both variants are translucent, never a solid fill — React Flow paints its
  // edges layer behind the nodes layer regardless of each node's own zIndex,
  // so a fully opaque lane (the old bg-white here) silently erased every
  // connector segment that passed under it, leaving only the portions inside
  // the one tinted lane visible and every step-to-step join into a plain lane
  // invisible. bg-white/70 keeps the same zebra contrast against the page's
  // own white background while letting edges show through everywhere.
  return (
    <div
      className={`relative flex h-full items-start border-b border-dashed border-slate-200 pl-4 pt-2.5 ${
        data.tinted ? "bg-slate-50/70" : "bg-white/70"
      }`}
    >
      {data.gutter ? (
        // In the gutter, to the left of the map. Drawn inside the lane it
        // used to collide with the row's first step — on a real export a
        // decision diamond sat squarely on top of a role name.
        <span
          className="absolute right-full flex items-center justify-end pr-3 text-right text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600"
          style={{ width: (data.gutter ?? 0) - 80, top: 0, bottom: 0 }}
        >
          {data.label}
        </span>
      ) : (
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{data.label}</span>
      )}
    </div>
  );
}

export type ContinuationNodeData = {
  /** "continues" sits after the last step of a row; "from" before the first. */
  kind: "continues" | "from";
  /** 1-based, as a reader counts rows. */
  otherRow: number;
  /** The connection's own label, kept with the marker rather than dropped. */
  connectionLabel?: string;
};

/**
 * Where a connection had to be broken because its two steps landed on
 * different rows of a wrapped map.
 *
 * Not a routed line, because in a swimlane diagram the space a line would have
 * to travel through to get around the steps is the next row's lanes — routing
 * around the steps means crossing the lanes instead. Printed flowcharts have
 * always solved this with a marked pair, for exactly this reason.
 */
export function ContinuationNode({ data }: NodeProps & { data: ContinuationNodeData }) {
  const goes = data.kind === "continues";
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal-400 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 shadow-sm">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <span aria-hidden>{goes ? "↳" : "↱"}</span>
      <span>
        {goes ? "continues on row " : "from row "}
        {data.otherRow}
      </span>
      {data.connectionLabel && (
        <span className="rounded bg-slate-100 px-1.5 py-px font-normal text-slate-700">
          {data.connectionLabel}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

export type CompactStepData = {
  label: string;
  roleName?: string;
  stepNumber?: number;
  kind: "task" | "decision" | "terminal";
  slaDays?: number | null;
  threshold?: number | null;
  direction?: AuthorityDirection;
  links?: StepLinkData[];
};

/**
 * A step as the printed report draws it on a wrapped map.
 *
 * Not the full card scaled down — a smaller card. Wrapping alone left a
 * 22-step process at about 5.7px of label text, because eight rows of
 * full-size cards do not fit a page's height however neatly they are arranged.
 * At this size six steps fit a row instead of three, four rows instead of
 * eight, and the drawing barely has to be scaled at all.
 *
 * What it keeps is everything that carries meaning: the number, the label, the
 * role, the decision's diamond, the approval gate, the SLA and the links to
 * other processes. A first draft dropped the last four as "chrome that does
 * not survive the shrink" — and an existing spec caught it, because a previous
 * feature had deliberately decided the printed diagram shows the same
 * documented content as the live canvas. It was right to. They are condensed
 * here, not removed.
 */
export function CompactStepNode({ data }: NodeProps & { data: CompactStepData }) {
  const { x, y } = PRINT_NODE_HALF_SIZE[data.kind];
  const w = x * 2;
  const h = y * 2;
  const gate = data.threshold != null ? gateLine(data.threshold, data.direction) : null;
  const detail = [
    data.slaDays != null ? `SLA ${data.slaDays}d` : null,
    gate,
    ...(data.links ?? []).map((l) => `\u2192 ${l.code}`),
  ].filter(Boolean) as string[];

  // A diamond has the least usable room of the three shapes, so it carries the
  // number and the name and nothing else: the lane already says whose it is,
  // and an SLA on a decision is rare. Crowding it is what clipped the name.
  const body = (
    <>
      <div className="flex items-center justify-center gap-1">
        {data.stepNumber != null && (
          <span className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded bg-indigo-600 font-mono text-[8px] font-bold text-white">
            {data.stepNumber}
          </span>
        )}
        <span className="text-[10px] font-semibold leading-tight text-slate-900">{data.label}</span>
      </div>
      {data.roleName && (
        <span
          title={data.roleName}
          className="text-[8.5px] font-medium uppercase leading-tight tracking-wide text-slate-600"
        >
          {shortRoleName(data.roleName)}
        </span>
      )}
      {detail.length > 0 && (
        <span className="text-[8px] font-semibold leading-tight text-slate-700">
          {detail.join(" \u00b7 ")}
        </span>
      )}
      {data.slaDays == null && data.kind === "task" && detail.length === 0 && (
        <span className="text-[8px] font-medium leading-tight text-slate-600">no SLA set</span>
      )}
    </>
  );

  // A decision is a diamond on paper too, not just on screen — the notation is
  // what tells a reader the flow forks here, and the project has a test that
  // says so. Drawn as a polygon like the full-size card, with the label inside
  // the largest rectangle whose corners still touch the edges.
  if (data.kind === "decision") {
    return (
      <div className="relative" style={{ width: w, height: h }}>
        <Handles />
        <svg width={w} height={h} className="absolute inset-0" aria-hidden>
          <polygon
            points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`}
            fill="#fffbeb"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center"
          style={{ width: w * DECISION_TEXT_INSET }}
        >
          <div className="flex items-center justify-center gap-1">
            {data.stepNumber != null && (
              <span className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded bg-indigo-600 font-mono text-[8px] font-bold text-white">
                {data.stepNumber}
              </span>
            )}
            <span className="text-[9.5px] font-semibold leading-tight text-slate-900">{data.label}</span>
          </div>
        </div>
        {/* The gate goes under the diamond, not inside it.
            Only the middle of a diamond is writable, and a first attempt at
            fitting the name and the figure in there clipped the name. A second
            attempt kept the name by dropping the figure — which on a decision
            is the more important half, since it is what the authority rule
            actually says. Outside the shape, both fit and neither is cut, and
            it is where a flowchart puts a condition anyway. */}
        {detail.length > 0 && (
          <span
            className="absolute left-1/2 w-max max-w-[150px] -translate-x-1/2 rounded bg-amber-50/90 px-1 text-center text-[8px] font-semibold leading-tight text-amber-900"
            style={{ top: h - 4 }}
          >
            {detail.join(" \u00b7 ")}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-center ${
        data.kind === "terminal"
          ? "rounded-full border border-emerald-300 bg-emerald-50"
          : "rounded-lg border border-slate-300 bg-white"
      }`}
      style={{ width: w, minHeight: h }}
    >
      <Handles />
      {body}
    </div>
  );
}

export type RowLabelData = {
  row: number;
  of: number;
  firstStep: number;
  lastStep: number;
  /** A serpentine row that runs right to left, so a reader is told before they start. */
  backward?: boolean;
};

/**
 * Which row of a wrapped map this is, and which steps are on it.
 *
 * Teal, and so are the continuation markers and the short link between rows.
 * Nothing else on the map uses it — a step number is indigo, a decision amber,
 * a card slate — so the row's furniture reads as signposting rather than as
 * more diagram. Reported as "very confusing to read": the rows were divided by
 * a dashed lane edge that looks like part of the swimlane, not like the end of
 * a row.
 */
export function RowLabelNode({ data }: NodeProps & { data: RowLabelData }) {
  return (
    <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal-400 bg-teal-50 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-teal-800">
      <span>Row</span>
      <span className="text-[10.5px]">{data.row}</span>
      <span className="font-semibold opacity-90">of {data.of}</span>
      <span className="font-semibold opacity-90">
        · steps {data.firstStep}–{data.lastStep}
      </span>
      {/* A backward row reads 12, 11, 10… across the page. Said in words as
          well as by the arrow, and before the row rather than after it, so a
          reader is warned instead of confused. */}
      {data.backward && <span className="font-semibold">· ← runs right to left</span>}
    </div>
  );
}

/** The rule across the page that ends one row and starts the next. */
export function RowRuleNode({ data }: NodeProps & { data: { width: number } }) {
  return <div className="border-t border-slate-300" style={{ width: data.width }} />;
}

export type LinkStubData = { kind: "out" | "in" };

/**
 * The short link tying one row's last step to the next row's first.
 *
 * "out" leaves the last step and turns down towards the row below; "in" comes
 * up and turns into the first step of the next row. They cannot meet — they
 * are at opposite ends of the page — so the matching colour and the arrowheads
 * are what pair them. A line drawn all the way round the sheet would meet, and
 * would cross the intervening lanes to do it.
 */
export function LinkStubNode({ data }: NodeProps & { data: LinkStubData }) {
  const W = 62;
  const H = 40;
  const out = data.kind === "out";
  return (
    <svg width={W + 6} height={H + 6} viewBox={`-3 -3 ${W + 6} ${H + 6}`} className="overflow-visible" aria-hidden>
      <path
        d={
          out
            ? `M 0 10 H ${W - 18} Q ${W - 4} 10 ${W - 4} 24 V ${H - 8}`
            : `M 4 ${H} V 22 Q 4 8 18 8 H ${W - 12}`
        }
        fill="none"
        stroke="#14b8a6"
        strokeWidth={2.25}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={
          out
            ? `M ${W - 10} ${H - 9} L ${W - 4} ${H} L ${W + 2} ${H - 9} z`
            : `M ${W - 13} 2 L ${W - 2} 8 L ${W - 13} 14 z`
        }
        fill="#14b8a6"
      />
    </svg>
  );
}
