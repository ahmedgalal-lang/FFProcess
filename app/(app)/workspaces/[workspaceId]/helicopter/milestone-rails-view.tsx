"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import {
  buildMilestoneRails,
  RAIL_WIDTH,
  type Bead,
  type Rail,
  type RailProcess,
} from "@/lib/domain/milestone-rails";

const TRACK_Y = 34; // where the rail's line sits within its band
const BEAD_SIZE = 13;

/**
 * The engagement as rails: one track per process, its milestones as beads, and
 * a dashed drop from the exact bead a branching process picks up from.
 *
 * Plain positioned elements rather than a graph canvas — the layout is fully
 * determined by buildMilestoneRails, nothing here is draggable, and the result
 * is meant to be exported and put in front of a client, where crisp text
 * matters more than pan and zoom.
 */
export function MilestoneRailsView({
  workspaceId,
  workspaceName,
  processes,
}: {
  workspaceId: string;
  workspaceName: string;
  processes: RailProcess[];
}) {
  const layout = useMemo(() => buildMilestoneRails(processes), [processes]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    setExporting(true);
    toPng(el, { backgroundColor: "#ffffff", pixelRatio: 2 })
      .then((dataUrl) => {
        const a = document.createElement("a");
        a.download = `${workspaceName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-milestones.png`;
        a.href = dataUrl;
        a.click();
      })
      .finally(() => setExporting(false));
  }, [workspaceName]);

  if (processes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">
        No processes yet — map one and it will appear here.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          {layout.milestoneCount > 0
            ? `${layout.milestoneCount} milestone${layout.milestoneCount === 1 ? "" : "s"} marked · steps another process depends on are always shown`
            : "No milestones marked yet — open a process's Steps List and use ★ to put a step on its rail."}
        </p>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="flex-none rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {exporting ? "Exporting…" : "⬇ PNG"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div
          ref={boardRef}
          className="relative bg-white px-6 py-5"
          style={{ width: layout.width + 48, minHeight: layout.height + 40 }}
        >
          {layout.drops.map((drop) => (
            <div
              key={drop.id}
              aria-hidden="true"
              className="pointer-events-none absolute w-0 border-l-[1.5px] border-dashed border-amber-400"
              style={{ left: drop.x, top: drop.fromY + TRACK_Y, height: drop.toY - drop.fromY }}
            />
          ))}

          {layout.rails.map((rail) => (
            <RailRow key={rail.processId} rail={rail} workspaceId={workspaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RailRow({ rail, workspaceId }: { rail: Rail; workspaceId: string }) {
  return (
    <div className="absolute" style={{ left: rail.offsetX, top: rail.y, width: RAIL_WIDTH, height: rail.height }}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{rail.code}</span>
        <Link
          href={`/workspaces/${workspaceId}/processes/${rail.processId}/map`}
          className="truncate text-[13px] font-semibold text-slate-900 hover:underline"
        >
          {rail.name}
        </Link>
        <span className="flex-none rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold text-slate-600">
          {rail.stepCount} {rail.stepCount === 1 ? "step" : "steps"}
        </span>
        {rail.branchFrom && (
          <span className="flex-none truncate rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
            ↰ from {rail.branchFrom.code} · step {rail.branchFrom.stepNumber}
          </span>
        )}
      </div>

      <div
        className={`absolute left-0 right-0 border-t-2 ${
          rail.branchFrom ? "border-dashed border-amber-300" : "border-slate-200"
        }`}
        style={{ top: TRACK_Y }}
      />

      {rail.isEmpty ? (
        <span className="absolute text-[10px] italic text-slate-500" style={{ left: 4, top: TRACK_Y + 7 }}>
          {rail.stepCount === 0 ? "No steps mapped yet" : "No milestones marked — ★ a step in its Steps List"}
        </span>
      ) : (
        rail.beads.map((bead) => <BeadMark key={bead.stepId} bead={bead} />)
      )}
    </div>
  );
}

function BeadMark({ bead }: { bead: Bead }) {
  // A marked milestone reads as the solid thing it is; a step that's only here
  // because another process depends on it is drawn lighter, so the picture
  // still distinguishes "we chose this" from "this is a junction".
  const ring = bead.isMilestone ? "border-[var(--accent)]" : "border-slate-300";
  const fill = bead.isMilestone ? "bg-white" : "bg-slate-100";

  return (
    <div className="absolute w-[104px] -translate-x-1/2 text-center" style={{ left: bead.x, top: TRACK_Y - BEAD_SIZE / 2 }}>
      <div
        className={`mx-auto border-2 ${ring} ${fill} ${bead.isDecision ? "rotate-45 rounded-[2px]" : "rounded-full"}`}
        style={{ width: BEAD_SIZE, height: BEAD_SIZE }}
        aria-hidden="true"
      />
      {/* Fixed height so "step N" lines up across beads whether the label above
          it wraps to one line or two. */}
      <div className="mt-1.5 line-clamp-2 h-[26px] text-[10px] font-semibold leading-tight text-slate-900">
        {bead.label}
      </div>
      <div className="text-[9px] text-slate-600">step {bead.number}</div>
      {(bead.branchedBy.length > 0 || bead.linksTo.length > 0) && (
        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
          {bead.branchedBy.map((code) => (
            <span key={`b-${code}`} className="rounded-full bg-amber-50 px-1 text-[8px] font-bold text-amber-800">
              ↳ {code}
            </span>
          ))}
          {bead.linksTo.map((code) => (
            <span key={`l-${code}`} className="rounded-full bg-indigo-50 px-1 text-[8px] font-bold text-indigo-700">
              🔗 {code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
