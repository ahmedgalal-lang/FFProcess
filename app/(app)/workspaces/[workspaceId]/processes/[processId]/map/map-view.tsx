"use client";

import { useState } from "react";
import { ProcessMapCanvas } from "./process-map-canvas";
import { StepListRow } from "./step-list-row";

type RoleRef = { id: string; name: string };
type StepT = {
  id: string;
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  positionX: number;
  positionY: number;
  assignedRole: RoleRef | null;
  swimlaneRole: RoleRef | null;
  reviewNotes: string | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
};
type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };

export function MapView({
  workspaceId,
  processId,
  processCode,
  steps,
  connections,
  roles,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
  steps: StepT[];
  connections: ConnectionT[];
  roles: RoleRef[];
}) {
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const incomingConnectionOf = new Map<string, ConnectionT>();
  for (const c of connections) incomingConnectionOf.set(c.toStepId, c);
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
            const incomingConnection = incomingConnectionOf.get(step.id);
            const predecessorStep = incomingConnection ? stepById.get(incomingConnection.fromStepId) : undefined;
            const predecessor = predecessorStep
              ? { id: predecessorStep.id, label: predecessorStep.label, type: predecessorStep.type }
              : undefined;
            const stepOptions = steps
              .filter((s) => s.id !== step.id)
              .map((s) => ({ id: s.id, label: s.label, type: s.type }));
            return (
              <StepListRow
                key={step.id}
                workspaceId={workspaceId}
                processId={processId}
                index={i}
                step={step}
                predecessor={predecessor}
                incomingConnection={incomingConnection}
                roles={roles}
                stepOptions={stepOptions}
              />
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
