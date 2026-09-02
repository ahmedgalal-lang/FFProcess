"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProcessKpis } from "@/lib/actions/process";

type Kpi = { metric: string; target: string; frequency: string };
type ControlPoint = { rowId: string; statement: string; flagged: boolean };

export function ProcessKpisControls({
  workspaceId,
  processId,
  processCode,
  processName,
  kpis,
  controlPoints,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
  processName: string;
  kpis: Kpi[];
  controlPoints: ControlPoint[];
}) {
  const [editing, setEditing] = useState(false);
  const [kpisInput, setKpisInput] = useState<Kpi[]>(kpis);
  const [error, setError] = useState<string | null>(null);
  // The one row Save is refusing to accept, so its inputs can be highlighted
  // — otherwise a "fill in the missing field" error with no indication of
  // *which* row (there can be several) leaves someone hunting for it.
  const [invalidRow, setInvalidRow] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    setInvalidRow(null);

    // A row with nothing in it at all (added, then left alone) is dropped
    // silently — that's just an abandoned "+ Add metric" click, not data
    // someone typed. A row with *some* fields filled is different: it used
    // to be dropped exactly the same way, with no error, which is how a
    // real metric someone entered could vanish on Save with no explanation.
    // That row now blocks the save instead, naming the field that's missing.
    const complete: Kpi[] = [];
    for (let i = 0; i < kpisInput.length; i++) {
      const metric = kpisInput[i]!.metric.trim();
      const target = kpisInput[i]!.target.trim();
      const frequency = kpisInput[i]!.frequency.trim();
      const filledCount = [metric, target, frequency].filter(Boolean).length;
      if (filledCount === 0) continue;
      if (filledCount < 3) {
        const missing = !metric ? "a metric" : !target ? "a target" : "a frequency";
        setError(`Row ${i + 1} is missing ${missing} — fill it in, or remove the row, then save again.`);
        setInvalidRow(i);
        return;
      }
      complete.push({ metric, target, frequency });
    }

    startTransition(async () => {
      try {
        const result = await updateProcessKpis({ workspaceId, processId, kpis: complete });
        if (!result.ok) {
          setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid input") : result.error);
          return;
        }
        setEditing(false);
        router.refresh();
      } catch {
        // A rejected call — the browser holding an old bundle after a deploy
        // is the usual cause — used to leave the form sitting there with no
        // error and nothing saved, which reads exactly like "it just doesn't
        // save". Say so, and keep what was typed on screen to retry.
        setError("Couldn't reach the server — reload the page and try saving again.");
      }
    });
  }

  function update(i: number, patch: Partial<Kpi>) {
    setKpisInput((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
    if (invalidRow === i) {
      setInvalidRow(null);
      setError(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
          {processCode}
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{processName}</h2>
      </div>

      <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Key Control Points</div>
      {controlPoints.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No co-approval controls in this process&rsquo;s Authority Matrix yet.</p>
      ) : (
        <ul className="mt-1 space-y-1.5 text-sm">
          {controlPoints.map((cp) => (
            <li
              key={cp.rowId}
              className={cp.flagged ? "rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-800" : "text-slate-700"}
            >
              {cp.flagged && <strong>⚠ </strong>}
              {cp.statement}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Operational KPIs &amp; SLAs</div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setKpisInput(kpis);
              setError(null);
              setEditing(true);
            }}
            aria-label={`Edit KPIs for ${processName}`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Frequency</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {kpisInput.map((item, i) => {
                  const rowInvalid = invalidRow === i;
                  const inputClass = `w-full rounded border px-1.5 py-1 ${
                    rowInvalid ? "border-red-400 bg-red-50" : "border-slate-300"
                  }`;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <input
                          value={item.metric}
                          aria-label={`Metric ${i + 1} for ${processName}`}
                          aria-invalid={rowInvalid}
                          onChange={(e) => update(i, { metric: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={item.target}
                          aria-label={`Target ${i + 1} for ${processName}`}
                          aria-invalid={rowInvalid}
                          onChange={(e) => update(i, { target: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={item.frequency}
                          aria-label={`Frequency ${i + 1} for ${processName}`}
                          aria-invalid={rowInvalid}
                          onChange={(e) => update(i, { frequency: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setKpisInput((items) => items.filter((_, idx) => idx !== i));
                            setInvalidRow(null);
                            setError(null);
                          }}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setKpisInput((items) => [...items, { metric: "", target: "", frequency: "" }]);
                  setInvalidRow(null);
                  setError(null);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                + Add metric
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      ) : kpis.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No metrics yet.</p>
      ) : (
        <div className="mt-1 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Frequency</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((item, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{item.metric}</td>
                  <td className="px-3 py-1.5">{item.target}</td>
                  <td className="px-3 py-1.5">{item.frequency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
