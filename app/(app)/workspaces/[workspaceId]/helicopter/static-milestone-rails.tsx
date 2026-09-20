import {
  buildMilestoneRails,
  MIN_BEAD_GAP,
  RAIL_SPACING,
  WRAP_EDGE,
  type Bead,
  type Rail,
  type RailProcess,
} from "@/lib/domain/milestone-rails";

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
 * How far below the track a bead's label block reaches: the bead itself, its
 * two lines of label, and the step number under them. The drop from one row of
 * a wrapped rail to the next starts below this, so it never crosses the text.
 */
const LABEL_BLOCK_HEIGHT = 62;

/**
 * A read-only rendering of the Milestone Rails for the Export Report — same
 * geometry as the interactive MilestoneRailsView, but with no PNG-export
 * button and no navigation link on a process's name, so it's safe to embed in
 * a preview/print page.
 */
export function StaticMilestoneRails({ processes }: { processes: RailProcess[] }) {
  // The width the rails have to fit, less the px-6 they are drawn inside. A
  // rail longer than this now folds onto another line rather than being
  // shrunk: at 22 milestones the shrink reached about 0.43, which put the
  // labels near 4px and made the view unreadable on the page it exists for.
  const layout = buildMilestoneRails(processes, {
    maxWidth: PAGE_CONTENT_WIDTH_PX - BOX_BORDER_PX - 48,
  });

  // px-6 / py-5 on the drawing itself, counted here so the box the rails are
  // fitted into is the one actually drawn rather than the bare layout size.
  const boxWidth = layout.width + 48;
  const boxHeight = layout.height + 40;
  // Fills the page width, up or down. It used to only ever shrink, which left
  // the common case drawn at three-quarters of the page: a chain of one or two
  // processes never reaches RAIL_WIDTH, so boxWidth sat at 768 against 1015 of
  // page and the rails were reported as simply too small to read. There is a
  // natural ceiling here rather than an arbitrary one — buildMilestoneRails
  // floors its width at RAIL_WIDTH, so the most this can ever magnify is
  // (PAGE_CONTENT_WIDTH_PX - BOX_BORDER_PX) / (RAIL_WIDTH + 48), about 1.32.
  const scale = (PAGE_CONTENT_WIDTH_PX - BOX_BORDER_PX) / boxWidth;

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
  // Where each line of a wrapped rail starts and ends, so the track is drawn
  // only under the beads it actually carries — a full-width line under a row
  // holding two beads reads as a rail that lost the rest of them.
  const lines = Array.from({ length: rail.rows }, (_, row) => {
    const xs = rail.beads.filter((b) => b.row === row).map((b) => b.x);
    if (xs.length === 0) return { row, left: 0, right: rail.width, turn: null as null | number };
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    // The track runs a little past its outermost beads, and the turn leaves
    // from the end the row finishes at — which alternates.
    const finishesAt = row % 2 === 1 ? left : right;
    return {
      row,
      left: Math.max(0, left - WRAP_EDGE / 2),
      right: Math.min(rail.width, right + WRAP_EDGE / 2),
      turn: row < rail.rows - 1 ? finishesAt : null,
    };
  });

  return (
    <div className="absolute" style={{ left: rail.offsetX, top: rail.y, width: rail.width, height: rail.height }}>
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

      {lines.map((line) => (
        <div key={`line-${line.row}`}>
          <div
            className={`absolute border-t-2 ${
              rail.branchFrom ? "border-dashed border-amber-300" : "border-slate-200"
            }`}
            style={{ left: line.left, width: line.right - line.left, top: TRACK_Y + line.row * RAIL_SPACING }}
          />
          {/* The turn. It drops straight down rather than looping out to the
              side, because the side is where the label is: a bead's label is
              centred on it and about a slot wide, so a loop wide enough to
              read passes through the text of the very bead it leaves. A
              serpentine row ends directly above where the next begins, so the
              two are already in one column and a straight line joins them —
              the same drop the wrapped process map uses for its own seam. */}
          {line.turn !== null && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute overflow-visible"
              style={{
                left: line.turn - 5,
                top: TRACK_Y + line.row * RAIL_SPACING + LABEL_BLOCK_HEIGHT,
                width: 10,
                height: RAIL_SPACING - LABEL_BLOCK_HEIGHT - 10,
              }}
            >
              <line
                x1={5}
                y1={0}
                x2={5}
                y2={RAIL_SPACING - LABEL_BLOCK_HEIGHT - 16}
                stroke="#0d9488"
                strokeWidth={2}
              />
              <path
                d={`M1,${RAIL_SPACING - LABEL_BLOCK_HEIGHT - 18} L5,${RAIL_SPACING - LABEL_BLOCK_HEIGHT - 10} L9,${RAIL_SPACING - LABEL_BLOCK_HEIGHT - 18} Z`}
                fill="#0d9488"
              />
            </svg>
          )}
          {/* Which line this is, and which way it runs. A backward line reads
              18, 17, 16 across the page, so it says so before you start it. */}
          {rail.rows > 1 && (
            <span
              // On a white ground, so the drop arriving from the row above
              // passes behind it and the text stays legible — the same thing
              // an edge label on the process map does.
              className="absolute bg-white px-1 font-mono text-[8.5px] font-bold tracking-wider text-teal-700"
              style={{
                left: line.row % 2 === 1 ? undefined : line.left,
                right: line.row % 2 === 1 ? rail.width - line.right : undefined,
                top: TRACK_Y + line.row * RAIL_SPACING - 15,
              }}
            >
              ROW {line.row + 1} OF {rail.rows}
              {line.row % 2 === 1 ? " \u2190 RIGHT TO LEFT" : ""}
            </span>
          )}
        </div>
      ))}

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
    <div
      className="absolute -translate-x-1/2 text-center"
      style={{ left: bead.x, top: TRACK_Y + bead.y - BEAD_SIZE / 2, width: MIN_BEAD_GAP - 4 }}
    >
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
