import { buildMilestoneRails, RAIL_WIDTH, type Bead, type Rail, type RailProcess } from "@/lib/domain/milestone-rails";

const TRACK_Y = 34;
const BEAD_SIZE = 13;

/**
 * The printable width of a report page in CSS pixels: an A4 landscape sheet
 * (297mm) less the 14mm margin on each side, which the printed page gets from
 * `@page` and the on-screen preview gets from .report-paper's padding — so the
 * same number holds for both. buildMilestoneRails lays the rails out in fixed
 * pixels with no idea of the page, and a real chain is wider than this, so
 * this is what they have to be fitted into.
 */
const PAGE_CONTENT_WIDTH_PX = (297 - 14 * 2) * (96 / 25.4);

/** The 1px border on each side of the framed box the rails are drawn inside. */
const BOX_BORDER_PX = 2;

/**
 * A read-only rendering of the Milestone Rails for the Export Report — same
 * geometry as the interactive MilestoneRailsView, but with no PNG-export
 * button and no navigation link on a process's name, so it's safe to embed in
 * a preview/print page.
 */
export function StaticMilestoneRails({ processes }: { processes: RailProcess[] }) {
  const layout = buildMilestoneRails(processes);

  // px-6 / py-5 on the drawing itself, counted here so the box the rails are
  // fitted into is the one actually drawn rather than the bare layout size.
  const boxWidth = layout.width + 48;
  const boxHeight = layout.height + 40;
  // Only ever shrinks: a chain narrower than the page is left at its own size
  // rather than stretched up to fill the width.
  const scale = Math.min(1, (PAGE_CONTENT_WIDTH_PX - BOX_BORDER_PX) / boxWidth);

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        {layout.milestoneCount > 0
          ? `${layout.milestoneCount} milestone${layout.milestoneCount === 1 ? "" : "s"} marked · steps another process depends on are always shown`
          : "No milestones marked yet."}
      </p>
      {/* Scaled to fit the page rather than scrolled. This is a printed sheet:
          a horizontal scrollbar is dead furniture in a PDF, and everything
          past the container's edge was simply gone from the page — the rails
          are laid out in fixed pixels, and a real chain is wider than A4. Same
          answer the report's process diagram already gives with fitView. */}
      <div className="break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div style={{ width: boxWidth * scale, height: boxHeight * scale }}>
          <div
            className="relative bg-white px-6 py-5"
            style={{
              width: boxWidth,
              minHeight: boxHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
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
              <StaticRailRow key={rail.processId} rail={rail} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticRailRow({ rail }: { rail: Rail }) {
  return (
    <div className="absolute" style={{ left: rail.offsetX, top: rail.y, width: RAIL_WIDTH, height: rail.height }}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{rail.code}</span>
        <span className="truncate text-[13px] font-semibold text-slate-900">{rail.name}</span>
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
          {rail.stepCount === 0 ? "No steps mapped" : "No milestones marked"}
        </span>
      ) : (
        rail.beads.map((bead) => <StaticBead key={bead.stepId} bead={bead} />)
      )}
    </div>
  );
}

function StaticBead({ bead }: { bead: Bead }) {
  // A marked milestone reads as the solid thing it is; a step that's only here
  // because another process depends on it is drawn lighter, matching the
  // interactive view's own distinction between "we chose this" and "junction".
  const ring = bead.isMilestone ? "border-[var(--accent)]" : "border-slate-300";
  const fill = bead.isMilestone ? "bg-white" : "bg-slate-100";

  return (
    <div className="absolute w-[104px] -translate-x-1/2 text-center" style={{ left: bead.x, top: TRACK_Y - BEAD_SIZE / 2 }}>
      <div
        className={`mx-auto border-2 ${ring} ${fill} ${bead.isDecision ? "rotate-45 rounded-[2px]" : "rounded-full"}`}
        style={{ width: BEAD_SIZE, height: BEAD_SIZE }}
        aria-hidden="true"
      />
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
