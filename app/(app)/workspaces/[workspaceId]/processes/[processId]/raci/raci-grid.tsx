"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRaciAssignment, finalizeRaciMatrix, reopenRaciMatrix } from "@/lib/actions/raci";
import type { RaciIssue } from "@/lib/domain/raci-validation";

type Code = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
const CYCLE: (Code | null)[] = [null, "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
const LETTER: Record<Code, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};
const CELL_STYLE: Record<Code, string> = {
  RESPONSIBLE: "bg-sky-50 text-sky-700",
  ACCOUNTABLE: "bg-indigo-50 text-indigo-700",
  CONSULTED: "bg-emerald-50 text-emerald-700",
  INFORMED: "bg-slate-100 text-slate-500",
};

type RoleT = { id: string; name: string };
type ActivityT = { id: string; name: string; assignments: Record<string, Code | undefined> };

export function RaciGrid({
  workspaceId,
  processId,
  roles,
  initialActivities,
  initialIssues,
  initialStatus,
}: {
  workspaceId: string;
  processId: string;
  roles: RoleT[];
  initialActivities: ActivityT[];
  initialIssues: RaciIssue[];
  initialStatus: "DRAFT" | "FINAL";
}) {
  const [activities, setActivities] = useState(initialActivities);
  const [issues, setIssues] = useState(initialIssues);
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function recomputeLocalIssues(next: ActivityT[]): RaciIssue[] {
    const out: RaciIssue[] = [];
    for (const a of next) {
      const codes = Object.values(a.assignments).filter(Boolean) as Code[];
      const acc = codes.filter((c) => c === "ACCOUNTABLE");
      const resp = codes.filter((c) => c === "RESPONSIBLE");
      if (acc.length === 0) out.push({ activityId: a.id, type: "MISSING_ACCOUNTABLE", roleIds: [] });
      else if (acc.length > 1) out.push({ activityId: a.id, type: "MULTIPLE_ACCOUNTABLE", roleIds: [] });
      if (resp.length === 0) out.push({ activityId: a.id, type: "MISSING_RESPONSIBLE", roleIds: [] });
    }
    return out;
  }

  function cycleCell(activityId: string, roleId: string) {
    const activity = activities.find((a) => a.id === activityId)!;
    const current = activity.assignments[roleId] ?? null;
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];

    const nextActivities = activities.map((a) =>
      a.id === activityId ? { ...a, assignments: { ...a.assignments, [roleId]: next ?? undefined } } : a
    );
    setActivities(nextActivities);
    setIssues(recomputeLocalIssues(nextActivities));

    startTransition(async () => {
      await setRaciAssignment({ workspaceId, activityId, roleId, code: next });
      router.refresh();
    });
  }

  const flaggedActivityIds = new Set(issues.map((i) => i.activityId));

  return (
    <div>
      {issues.length === 0 ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Ready to finalize — every activity has exactly one Accountable and at least one Responsible.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {issues.length} validation issue{issues.length > 1 ? "s" : ""} — finalization blocked.
        </div>
      )}

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Activity</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-center">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr
                key={activity.id}
                className={`border-t border-slate-100 ${flaggedActivityIds.has(activity.id) ? "shadow-[inset_3px_0_0_0_theme(colors.red.400)]" : ""}`}
              >
                <th className="px-4 py-2 text-left font-medium text-slate-900">{activity.name}</th>
                {roles.map((r) => {
                  const code = activity.assignments[r.id];
                  return (
                    <td key={r.id} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => cycleCell(activity.id, r.id)}
                        className={`h-8 w-8 rounded-lg font-mono text-xs font-bold ${code ? CELL_STYLE[code] : "border border-dashed border-slate-300 text-slate-300"}`}
                      >
                        {code ? LETTER[code] : ""}
                      </button>
                    </td>
                  );
                })}
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
