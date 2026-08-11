"use client";

import { useState } from "react";
import Link from "next/link";
import { ProcessMapCanvas } from "./process-map-canvas";

const TYPE_STYLES: Record<string, string> = {
  START: "bg-emerald-50 text-emerald-700",
  END: "bg-emerald-50 text-emerald-700",
  TASK: "bg-slate-100 text-slate-600",
  DECISION: "bg-indigo-50 text-indigo-700",
};

type RoleRef = { id: string; name: string };
type StepT = {
  id: string;
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  positionX: number;
  positionY: number;
  assignedRole: RoleRef | null;
  swimlaneRole: RoleRef | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
};
type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };

export function MapView({
  workspaceId,
  processId,
  processCode,
  steps,
  connections,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
  steps: StepT[];
  connections: ConnectionT[];
}) {
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const predecessorOf = new Map<string, string>();
  for (const c of connections) predecessorOf.set(c.toStepId, c.fromStepId);
  const stepById = new Map(steps.map((s) => [s.id, s]));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="group" aria-label="Process Map view">
          {(["diagram", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {m === "diagram" ? "⌗ Diagram" : "☰ Steps List"}
            </button>
          ))}
        </div>
        <a
          href={`/api/export/process-map/${processId}`}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export PDF
        </a>
      </div>

      {mode === "diagram" ? (
        <ProcessMapCanvas
          workspaceId={workspaceId}
          processId={processId}
          processCode={processCode}
          steps={steps}
          connections={connections}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => {
            const predecessor = stepById.get(predecessorOf.get(step.id) ?? "");
            return (
              <div key={step.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-indigo-50 font-mono text-xs font-bold text-indigo-700">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_STYLES[step.type]}`}>
                      {step.type}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{step.label}</span>
                    {step.assignedRole && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {step.assignedRole.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {predecessor ? `Connects from: ${predecessor.label}` : "Entry point — no predecessor"}
                  </div>
                  {step.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {step.links.map((link) => (
                        <Link
                          key={link.id}
                          href={`/workspaces/${workspaceId}/processes/${link.targetProcessId}/map`}
                          className="rounded-full border border-dashed border-indigo-300 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          🔗 {link.targetProcess.code} — {link.targetProcess.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {steps.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No steps yet — add the first one below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
