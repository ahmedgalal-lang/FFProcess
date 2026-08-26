"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProcessKpis } from "@/lib/actions/process";

type Kpi = { metric: string; target: string; frequency: string };
type ControlPoint = { rowId: string; statement: string; flagged: boolean };

export function ProcessKpisControls({
  workspaceId,
  processId,
  kpis,
  controlPoints,
}: {
  workspaceId: string;
  processId: string;
  kpis: Kpi[];
  controlPoints: ControlPoint[];
}) {
  const [editing, setEditing] = useState(false);
  const [kpisInput, setKpisInput] = useState<Kpi[]>(kpis);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProcessKpis({
        workspaceId,
        processId,
        kpis: kpisInput.filter((k) => k.metric.trim() && k.target.trim() && k.frequency.trim()),
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid input") : result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function update(i: number, patch: Partial<Kpi>) {
    setKpisInput((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-800">Governance, Controls &amp; Metrics</div>
      <p className="mt-0.5 text-xs text-slate-500">Shown as the final step of the Export Report, after the Authority Matrix.</p>

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
            aria-label="Edit KPIs"
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
                {kpisInput.map((item, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <input
                        value={item.metric}
                        aria-label="Metric"
                        onChange={(e) => update(i, { metric: e.target.value })}
                        className="w-full rounded border border-slate-300 px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={item.target}
                        aria-label="Target"
                        onChange={(e) => update(i, { target: e.target.value })}
                        className="w-full rounded border border-slate-300 px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={item.frequency}
                        aria-label="Frequency"
                        onChange={(e) => update(i, { frequency: e.target.value })}
                        className="w-full rounded border border-slate-300 px-1.5 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setKpisInput((items) => items.filter((_, idx) => idx !== i))}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setKpisInput((items) => [...items, { metric: "", target: "", frequency: "" }])}
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
