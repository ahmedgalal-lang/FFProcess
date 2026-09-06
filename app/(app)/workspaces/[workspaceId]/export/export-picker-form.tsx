"use client";

import { useState } from "react";

type PickerProcess = { id: string; code: string; name: string };

/**
 * The pick-and-arrange step for one exported pack.
 *
 * The order lives nowhere but this form. A native GET form serialises its
 * controls in DOM order, so moving a row *is* editing the report link's
 * sequence of `ids` — which is what the report then comes out in. Nothing is
 * written: arranging a pack for one audience can't disturb the workspace, the
 * next pack, or anyone else's view, because there is no stored order to
 * disturb. It also means an arranged report stays arranged when its link is
 * shared, since the arrangement is part of the link.
 *
 * Move buttons rather than drag-and-drop: they work from the keyboard alone,
 * which drag does not (Constitution Principle IV), and they match the Steps
 * List, which solves this same problem elsewhere in the product.
 */
export function ExportPickerForm({
  workspaceId,
  processes,
}: {
  workspaceId: string;
  processes: PickerProcess[];
}) {
  const [ordered, setOrdered] = useState(processes);

  function move(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    next[index] = next[to]!;
    next[to] = ordered[index]!;
    setOrdered(next);
  }

  return (
    <form action={`/reports/${workspaceId}`} method="GET">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-4 py-2">
                <span className="sr-only">Include</span>
              </th>
              <th scope="col" className="px-4 py-2">
                Code
              </th>
              <th scope="col" className="px-4 py-2">
                Process
              </th>
              <th scope="col" className="w-24 px-4 py-2 text-right">
                Order
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p, index) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="ids"
                    value={p.id}
                    defaultChecked
                    aria-label={`Include ${p.code} — ${p.name}`}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{p.code}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${p.code} earlier in the report`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1}
                      aria-label={`Move ${p.code} later in the report`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        The report follows the order above. Arranging it here changes this pack only — the
        Processes page and every other export are left as they are.
      </p>

      <button
        type="submit"
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Preview report →
      </button>
    </form>
  );
}
