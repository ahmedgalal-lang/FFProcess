"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arrangeProcessStepsByFlow } from "@/lib/actions/process";
import type { StepGap } from "@/lib/domain/step-readiness";
import type { AuthorityDirection } from "@/lib/domain/authority-table";
import { ProcessMapCanvas, type BranchFromT } from "./process-map-canvas";
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
  milestone: boolean;
  joinRequiresAll: boolean;
  gaps: StepGap[];
  detailedAction: string[];
  exceptionHandling: string | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
  slaDays?: number | null;
  threshold?: number | null;
  direction?: AuthorityDirection;
};
type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };
type ProcessOption = { id: string; code: string; name: string };

export function MapView({
  workspaceId,
  processId,
  processCode,
  steps,
  connections,
  roles,
  branchFrom,
  otherProcesses,
}: {
  workspaceId: string;
  processId: string;
  processCode: string;
  steps: StepT[];
  connections: ConnectionT[];
  roles: RoleRef[];
  branchFrom?: BranchFromT | null;
  otherProcesses: ProcessOption[];
}) {
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const [arrangeError, setArrangeError] = useState<string | null>(null);
  const [arranging, startArranging] = useTransition();
  const router = useRouter();
  // Every connection landing on a step — a step's predecessors, not just one (spec 015 FR-001).
  const incomingConnectionsOf = new Map<string, ConnectionT[]>();
  for (const c of connections) {
    const list = incomingConnectionsOf.get(c.toStepId) ?? [];
    list.push(c);
    incomingConnectionsOf.set(c.toStepId, list);
  }
  // A Decision step's branches (spec 014) — every connection leaving it, not
  // just the one incoming connector every row already tracks.
  const outgoingConnectionsOf = new Map<string, ConnectionT[]>();
  for (const c of connections) {
    const list = outgoingConnectionsOf.get(c.fromStepId) ?? [];
    list.push(c);
    outgoingConnectionsOf.set(c.fromStepId, list);
  }
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
        <div className="flex items-center gap-2">
          {mode === "list" && steps.length > 1 && (
            <button
              type="button"
              disabled={arranging}
              onClick={() => {
                setArrangeError(null);
                startArranging(async () => {
                  const result = await arrangeProcessStepsByFlow({ workspaceId, processId });
                  if (!result.ok) {
                    setArrangeError(
                      result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not arrange") : result.error
                    );
                    return;
                  }
                  router.refresh();
                });
              }}
              title="Renumber the steps so each one follows whatever connects into it"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {arranging ? "Arranging…" : "↓↑ Arrange by flow"}
            </button>
          )}
          <a
            href={`/api/export/process-map/${processId}`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export PDF
          </a>
        </div>
      </div>
      {arrangeError && <p className="mb-2 text-xs text-red-600">{arrangeError}</p>}

      {mode === "diagram" ? (
        <ProcessMapCanvas
          workspaceId={workspaceId}
          processId={processId}
          processCode={processCode}
          steps={steps}
          connections={connections}
          branchFrom={branchFrom}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => {
            const incomingConnections = incomingConnectionsOf.get(step.id) ?? [];
            const predecessors = incomingConnections
              .map((c) => {
                const s = stepById.get(c.fromStepId);
                return s ? { id: s.id, label: s.label, type: s.type, connectionLabel: c.label } : undefined;
              })
              .filter((p): p is NonNullable<typeof p> => p !== undefined);
            const stepOptions = steps
              .filter((s) => s.id !== step.id)
              .map((s) => ({ id: s.id, label: s.label, type: s.type }));
            return (
              <StepListRow
                key={step.id}
                workspaceId={workspaceId}
                processId={processId}
                index={i}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                step={step}
                predecessors={predecessors}
                incomingConnections={incomingConnections}
                outgoingConnections={outgoingConnectionsOf.get(step.id) ?? []}
                roles={roles}
                stepOptions={stepOptions}
                otherProcesses={otherProcesses}
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
