import Link from "next/link";
import type { DashboardTile } from "@/lib/domain/governance-dashboard";
import { SectionGuide } from "./section-guide";

const TONE_STYLE: Record<DashboardTile["tone"], string> = {
  alert: "border-red-200 bg-red-50 text-red-900 hover:border-red-300",
  warn: "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400",
  neutral: "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
};

/**
 * What needs attention, first on the Governance page (spec 026). Every tile
 * is a link to the records it counts. A workspace with nothing recorded says
 * so, rather than showing zeros that read like a clean bill of health.
 */
export function GovernanceDashboard({ basePath, tiles, empty }: { basePath: string; tiles: DashboardTile[]; empty: boolean }) {
  return (
    <section aria-labelledby="governance-summary-heading" className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 id="governance-summary-heading" className="text-sm font-bold text-slate-900">
          What needs attention
        </h2>
        <SectionGuide id="attention" />
      </div>
      {empty ? (
        <p className="text-xs text-slate-600">
          Nothing has been recorded yet. Generate an assessment, or add risks, policies or checklist items, and a
          summary of what needs attention will appear here.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => {
            const className = `flex h-full flex-col rounded-lg border px-3 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${TONE_STYLE[tile.tone]}`;
            const body = (
              <>
                <span className="text-xl font-bold tabular-nums">
                  {tile.count}
                  {tile.detail?.startsWith("of ") && <span className="text-xs font-semibold"> {tile.detail}</span>}
                </span>
                <span className="text-[11px] font-semibold">{tile.label}</span>
                {tile.detail && !tile.detail.startsWith("of ") && <span className="text-[10px]">{tile.detail}</span>}
              </>
            );
            return (
              <li key={tile.id} data-tile={tile.id}>
                {tile.href.startsWith("?") ? (
                  <Link href={`${basePath}${tile.href}`} className={className}>
                    {body}
                  </Link>
                ) : (
                  <a href={tile.href} className={className}>
                    {body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
