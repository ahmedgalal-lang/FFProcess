"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStepRaci, skipStepRaci, unskipStepRaci } from "@/lib/actions/raci";

type Code = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
const CYCLE: (Code | null)[] = [null, "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
const LETTER: Record<Code, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};
const CHIP_STYLE: Record<Code, string> = {
  RESPONSIBLE: "border-sky-300 bg-sky-50 text-sky-700",
  ACCOUNTABLE: "border-indigo-300 bg-indigo-50 text-indigo-700",
  CONSULTED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  INFORMED: "border-slate-300 bg-slate-100 text-slate-600",
};

type RoleT = { id: string; name: string };
type QueueStepT = { id: string; type: "START" | "TASK" | "DECISION" | "END"; label: string };

export function RaciStepQueue({
  workspaceId,
  processId,
  roles,
  pendingSteps,
  skippedSteps,
  handledCount,
  totalCount,
}: {
  workspaceId: string;
  processId: string;
  roles: RoleT[];
  pendingSteps: QueueStepT[];
  skippedSteps: QueueStepT[];
  handledCount: number;
  totalCount: number;
}) {
  const [assignments, setAssignments] = useState<Record<string, Record<string, Code | null>>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (totalCount === 0) return null;

  function codeFor(stepId: string, roleId: string): Code | null {
    return assignments[stepId]?.[roleId] ?? null;
  }

  function cycleChip(stepId: string, roleId: string) {
    const current = codeFor(stepId, roleId);
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    setAssignments((prev) => ({ ...prev, [stepId]: { ...prev[stepId], [roleId]: next } }));
  }

  function markHandled(stepId: string) {
    const stepAssignments = Object.entries(assignments[stepId] ?? {})
      .filter((entry): entry is [string, Code] => entry[1] !== null && entry[1] !== undefined)
      .map(([roleId, code]) => ({ roleId, code }));

    startTransition(async () => {
      await assignStepRaci({ workspaceId, processId, stepId, assignments: stepAssignments });
      router.refresh();
    });
  }

  function skip(stepId: string) {
    startTransition(async () => {
      await skipStepRaci({ workspaceId, processId, stepId });
      router.refresh();
    });
  }

  function undoSkip(stepId: string) {
    startTransition(async () => {
      await unskipStepRaci({ workspaceId, processId, stepId });
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Steps to fill in</h2>
        <span className="text-xs font-medium text-slate-500">
          {handledCount} of {totalCount} steps handled
        </span>
      </div>

      {pendingSteps.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pendingSteps.map((step) => (
            <li key={step.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  {step.type}
                </span>
                <span className="text-sm font-semibold text-slate-900">{step.label}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {roles.map((role) => {
                  const code = codeFor(step.id, role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => cycleChip(step.id, role.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        code ? CHIP_STYLE[code] : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {role.name}
                      {code && <span className="ml-1 font-bold">· {LETTER[code]}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => markHandled(step.id)}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Mark handled
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => skip(step.id)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Skip — no RACI needed
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {skippedSteps.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {skippedSteps.map((step) => (
            <li
              key={step.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5"
            >
              <span className="text-xs text-slate-400 line-through">{step.label}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => undoSkip(step.id)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40"
              >
                Undo skip
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingSteps.length === 0 && skippedSteps.length === 0 && (
        <p className="text-xs font-medium text-emerald-700">All steps have been assigned or skipped.</p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Skipping doesn&apos;t hide the step forever — it just moves on. Anything still un-assigned keeps
        showing up here (and in the stepper&apos;s &ldquo;RACI Matrix&rdquo; count) until you assign or
        explicitly skip it.
      </p>
    </div>
  );
}
