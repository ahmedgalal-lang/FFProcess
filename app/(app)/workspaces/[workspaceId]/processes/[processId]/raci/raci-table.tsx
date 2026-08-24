"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRaciAssignment, setStepRaciCell, skipStepRaci, unskipStepRaci, finalizeRaciMatrix, reopenRaciMatrix } from "@/lib/actions/raci";
import type { RaciIssue } from "@/lib/domain/raci-validation";
import type { RaciTableRow } from "@/lib/domain/raci-table";

type Code = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
const CYCLE: (Code | null)[] = [null, "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
const LETTER: Record<Code, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};
const CODE_NAME: Record<Code, string> = {
  RESPONSIBLE: "Responsible",
  ACCOUNTABLE: "Accountable",
  CONSULTED: "Consulted",
  INFORMED: "Informed",
};
const CELL_STYLE: Record<Code, string> = {
  RESPONSIBLE: "bg-sky-50 text-sky-700",
  ACCOUNTABLE: "bg-indigo-50 text-indigo-700",
  CONSULTED: "bg-emerald-50 text-emerald-700",
  INFORMED: "bg-slate-100 text-slate-500",
};

type RoleT = { id: string; name: string };

export function RaciTable({
  workspaceId,
  processId,
  roles,
  initialRows,
  initialIssues,
  initialStatus,
}: {
  workspaceId: string;
  processId: string;
  roles: RoleT[];
  initialRows: RaciTableRow[];
  initialIssues: RaciIssue[];
  initialStatus: "DRAFT" | "FINAL";
}) {
  const [rows, setRows] = useState(initialRows);
  const [issues, setIssues] = useState(initialIssues);
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [focusedCell, setFocusedCell] = useState({ row: 0, col: 0 });
  const router = useRouter();
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  const visibleRows = rows.filter((r) => !r.skipped);

  function cellKey(rowIdx: number, colIdx: number) {
    return `${rowIdx}:${colIdx}`;
  }

  function focusCell(rowIdx: number, colIdx: number) {
    const clampedRow = Math.max(0, Math.min(visibleRows.length - 1, rowIdx));
    const clampedCol = Math.max(0, Math.min(roles.length - 1, colIdx));
    cellRefs.current.get(cellKey(clampedRow, clampedCol))?.focus();
  }

  function onCellKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, rowIdx: number, colIdx: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusCell(rowIdx, colIdx + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusCell(rowIdx, colIdx - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusCell(rowIdx + 1, colIdx);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rowIdx - 1, colIdx);
        break;
      case "Home":
        e.preventDefault();
        focusCell(rowIdx, 0);
        break;
      case "End":
        e.preventDefault();
        focusCell(rowIdx, roles.length - 1);
        break;
    }
  }

  function recomputeLocalIssues(next: RaciTableRow[]): RaciIssue[] {
    const out: RaciIssue[] = [];
    for (const r of next) {
      if (r.skipped) continue;
      const codes = Object.values(r.assignments).filter(Boolean) as Code[];
      const acc = codes.filter((c) => c === "ACCOUNTABLE");
      const resp = codes.filter((c) => c === "RESPONSIBLE");
      if (acc.length === 0) out.push({ activityId: r.id, type: "MISSING_ACCOUNTABLE", roleIds: [] });
      else if (acc.length > 1) out.push({ activityId: r.id, type: "MULTIPLE_ACCOUNTABLE", roleIds: [] });
      if (resp.length === 0) out.push({ activityId: r.id, type: "MISSING_RESPONSIBLE", roleIds: [] });
    }
    return out;
  }

  function cycleCell(row: RaciTableRow, roleId: string) {
    const current = row.assignments[roleId] ?? null;
    const idx = CYCLE.indexOf(current as Code | null);
    const next = CYCLE[(idx + 1) % CYCLE.length];

    const nextRows = rows.map((r) =>
      r.id === row.id ? { ...r, assignments: { ...r.assignments, [roleId]: next ?? undefined } as Record<string, Code> } : r
    );
    setRows(nextRows);
    setIssues(recomputeLocalIssues(nextRows));

    startTransition(async () => {
      if (row.kind === "activity") {
        await setRaciAssignment({ workspaceId, activityId: row.id, roleId, code: next });
      } else {
        await setStepRaciCell({ workspaceId, processId, stepId: row.id, roleId, code: next });
      }
      router.refresh();
    });
  }

  function toggleSkip(row: RaciTableRow) {
    if (!row.stepId || row.kind !== "step") return;
    const nextRows = rows.map((r) => (r.id === row.id ? { ...r, skipped: !r.skipped } : r));
    setRows(nextRows);
    setIssues(recomputeLocalIssues(nextRows));

    startTransition(async () => {
      if (row.skipped) {
        await unskipStepRaci({ workspaceId, processId, stepId: row.stepId! });
      } else {
        await skipStepRaci({ workspaceId, processId, stepId: row.stepId! });
      }
      router.refresh();
    });
  }

  const flaggedRowIds = new Set(issues.map((i) => i.activityId));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {status === "DRAFT" ? (
          <button
            type="button"
            disabled={pending || issues.length > 0}
            onClick={() =>
              startTransition(async () => {
                const result = await finalizeRaciMatrix({ workspaceId, processId });
                if (result.ok) setStatus("FINAL");
                router.refresh();
              })
            }
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Mark Final
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await reopenRaciMatrix({ workspaceId, processId });
                setStatus("DRAFT");
                router.refresh();
              })
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            Reopen
          </button>
        )}
        <span
          className={
            status === "FINAL"
              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
              : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
          }
        >
          {status}
        </span>
      </div>

      {issues.length === 0 ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Ready to finalize — every task has exactly one Accountable and at least one Responsible.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {issues.length} task{issues.length > 1 ? "s" : ""} missing an Accountable or Responsible — finalization blocked.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" role="grid" aria-label="RACI assignments by task and role">
          <caption className="sr-only">
            Each cell cycles Responsible, Accountable, Consulted, Informed, then clear. Use the arrow keys to move
            between cells. Every Process Map step is already a row — use Skip for a step that doesn&apos;t need
            RACI.
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-2">
                Task
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-2 text-center">
                  {r.name}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center">
                Needed?
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIdx) => {
              const flagged = flaggedRowIds.has(row.id);
              return (
                <tr key={row.id} className="border-t border-slate-100">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium text-slate-900 ${flagged ? "shadow-[inset_3px_0_0_0_theme(colors.red.400)]" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {row.stepType && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          {row.stepType}
                        </span>
                      )}
                      <span>{row.label}</span>
                    </div>
                    {flagged && <span className="sr-only"> — has a validation issue</span>}
                  </th>
                  {roles.map((r, colIdx) => {
                    const code = row.assignments[r.id] as Code | undefined;
                    return (
                      <td key={r.id} role="gridcell" className="px-3 py-2 text-center">
                        <button
                          ref={(el) => {
                            if (el) cellRefs.current.set(cellKey(rowIdx, colIdx), el);
                            else cellRefs.current.delete(cellKey(rowIdx, colIdx));
                          }}
                          type="button"
                          tabIndex={focusedCell.row === rowIdx && focusedCell.col === colIdx ? 0 : -1}
                          onFocus={() => setFocusedCell({ row: rowIdx, col: colIdx })}
                          onClick={() => cycleCell(row, r.id)}
                          onKeyDown={(e) => onCellKeyDown(e, rowIdx, colIdx)}
                          aria-label={`${row.label}, ${r.name}: ${code ? CODE_NAME[code] : "not assigned"}`}
                          className={`h-8 w-8 rounded-lg font-mono text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${code ? CELL_STYLE[code] : "border border-dashed border-slate-300 text-slate-300"}`}
                        >
                          {code ? LETTER[code] : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    {row.kind === "step" && (
                      <button
                        type="button"
                        onClick={() => toggleSkip(row)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        Skip
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows
              .filter((r) => r.skipped)
              .map((row) => (
                <tr key={row.id} className="border-t border-slate-100 opacity-50">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium text-slate-500 line-through">
                    <div className="flex items-center gap-2">
                      {row.stepType && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          {row.stepType}
                        </span>
                      )}
                      <span>{row.label}</span>
                    </div>
                  </th>
                  {roles.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center text-slate-300">
                      —
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleSkip(row)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Skipped ✕
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span><b className="text-sky-700">R</b> Responsible</span>
        <span><b className="text-indigo-700">A</b> Accountable</span>
        <span><b className="text-emerald-700">C</b> Consulted</span>
        <span><b className="text-slate-500">I</b> Informed</span>
      </div>
    </div>
  );
}
