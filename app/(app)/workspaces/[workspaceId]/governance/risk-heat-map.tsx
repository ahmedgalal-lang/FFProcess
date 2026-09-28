"use client";

import type { HeatMapCell } from "@/lib/domain/risk-treatment";
import { IMPACT_ORDER, LIKELIHOOD_ROWS } from "@/lib/domain/risk-treatment";

const CELL_TONE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-900 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-900 border-amber-200",
  LOW: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const word = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

export type HeatMapSelection = { likelihood: string; impact: string } | null;

/**
 * Likelihood × impact, counting the risks the register is showing (spec 027).
 * A real table: likelihood labels the rows, impact the columns. Each non-empty
 * cell is a toggle button that filters the register to exactly the risks it
 * counted. The count and the level word are printed in the cell, so the map
 * reads without colour.
 */
export function RiskHeatMap({
  cells,
  selected,
  onSelect,
}: {
  cells: HeatMapCell[];
  selected: HeatMapSelection;
  onSelect: (cell: HeatMapSelection) => void;
}) {
  const at = (l: string, i: string) => cells.find((c) => c.likelihood === l && c.impact === i)!;

  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center text-[11px]">
        <caption className="mb-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
          Heat map — open risks by likelihood and impact
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-20 text-left text-[10px] font-semibold text-slate-500">
              Likelihood ↓ · Impact →
            </th>
            {IMPACT_ORDER.map((impact) => (
              <th key={impact} scope="col" className="font-semibold text-slate-600">
                {word(impact)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LIKELIHOOD_ROWS.map((likelihood) => (
            <tr key={likelihood}>
              <th scope="row" className="text-left font-semibold text-slate-600">
                {word(likelihood)}
              </th>
              {IMPACT_ORDER.map((impact) => {
                const cell = at(likelihood, impact);
                const isSelected = selected?.likelihood === likelihood && selected.impact === impact;
                const tone = `${CELL_TONE[cell.level]} rounded-md border`;
                if (cell.count === 0) {
                  return (
                    <td key={impact} className={`${tone} py-2 opacity-60`}>
                      <span aria-hidden="true">0</span>
                      <span className="sr-only">No risks, likelihood {word(likelihood)}, impact {word(impact)}</span>
                    </td>
                  );
                }
                return (
                  <td key={impact} className="p-0">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${cell.count} risk${cell.count === 1 ? "" : "s"}, likelihood ${word(likelihood)}, impact ${word(impact)}, level ${word(cell.level)}`}
                      onClick={() => onSelect(isSelected ? null : { likelihood, impact })}
                      className={`${tone} w-full py-1.5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                        isSelected ? "ring-2 ring-indigo-600" : ""
                      }`}
                    >
                      <span className="block text-sm">{cell.count}</span>
                      <span className="block text-[9px] font-semibold uppercase">{word(cell.level)}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
