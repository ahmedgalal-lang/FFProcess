"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateProcessStep,
  deleteProcessStep,
  createStepConnection,
  deleteStepConnection,
} from "@/lib/actions/process";

const TYPE_STYLES: Record<string, string> = {
  START: "bg-emerald-50 text-emerald-700",
  END: "bg-emerald-50 text-emerald-700",
  TASK: "bg-slate-100 text-slate-600",
  DECISION: "bg-indigo-50 text-indigo-700",
};

const STEP_TYPE_PREFIX: Record<string, string> = {
  START: "Start",
  TASK: "Task",
  DECISION: "Decision",
  END: "End",
};

type RoleRef = { id: string; name: string };
type StepType = "START" | "TASK" | "DECISION" | "END";
type StepT = {
  id: string;
  type: StepType;
  label: string;
  assignedRole: RoleRef | null;
  reviewNotes: string | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
};
type ConnectionT = { id: string; fromStepId: string; toStepId: string; label: string | null };
type StepOption = { id: string; label: string; type: StepType };

export function StepListRow({
  workspaceId,
  processId,
  index,
  step,
  predecessor,
  incomingConnection,
  roles,
  stepOptions,
}: {
  workspaceId: string;
  processId: string;
  index: number;
  step: StepT;
  predecessor: StepOption | undefined;
  incomingConnection: ConnectionT | undefined;
  roles: RoleRef[];
  stepOptions: StepOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [label, setLabel] = useState(step.label);
  const [type, setType] = useState<StepType>(step.type);
  const [roleId, setRoleId] = useState(step.assignedRole?.id ?? "");
  const [fromStepId, setFromStepId] = useState(predecessor?.id ?? "");
  const [connectionLabel, setConnectionLabel] = useState(incomingConnection?.label ?? "");

  function startEditing() {
    setLabel(step.label);
    setType(step.type);
    setRoleId(step.assignedRole?.id ?? "");
    setFromStepId(predecessor?.id ?? "");
    setConnectionLabel(incomingConnection?.label ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProcessStep({
        workspaceId,
        processId,
        stepId: step.id,
        type,
        label,
        assignedRoleId: roleId || undefined,
        swimlaneRoleId: roleId || undefined,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid step") : result.error);
        return;
      }

      const connectionChanged =
        fromStepId !== (predecessor?.id ?? "") || connectionLabel !== (incomingConnection?.label ?? "");

      if (connectionChanged) {
        if (incomingConnection) {
          const deleted = await deleteStepConnection({
            workspaceId,
            processId,
            connectionId: incomingConnection.id,
          });
          if (!deleted.ok) {
            setError("Could not update the connector");
            return;
          }
        }
        if (fromStepId) {
          const created = await createStepConnection({
            workspaceId,
            processId,
            fromStepId,
            toStepId: step.id,
            label: connectionLabel || undefined,
          });
          if (!created.ok) {
            setError(created.error === "VALIDATION_ERROR" ? (created.message ?? "Invalid connector") : created.error);
            return;
          }
        }
      }

      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProcessStep({ workspaceId, processId, stepId: step.id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not delete step") : result.error);
        setConfirmingDelete(false);
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Step name">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as StepType)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="TASK">Task</option>
              <option value="DECISION">Decision</option>
              <option value="START">Start</option>
              <option value="END">End</option>
            </select>
          </Field>
          <Field label="Assigned role">
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">— none —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Connects from">
            <select
              value={fromStepId}
              onChange={(e) => setFromStepId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">— entry point —</option>
              {stepOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  [{STEP_TYPE_PREFIX[s.type]}] {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Connector label">
            <input
              value={connectionLabel}
              onChange={(e) => setConnectionLabel(e.target.value)}
              placeholder="Yes / No"
              className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-indigo-50 font-mono text-xs font-bold text-indigo-700">
        {index + 1}
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
          {predecessor
            ? `Connects from: ${predecessor.label}${incomingConnection?.label ? ` (${incomingConnection.label})` : ""}`
            : "Entry point — no predecessor"}
        </div>
        {step.reviewNotes && (
          <div className="mt-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 px-2.5 py-1.5 text-xs text-indigo-800">
            <span className="font-semibold">AI Review note:</span> {step.reviewNotes}
          </div>
        )}
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
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex flex-none items-start gap-1.5">
        {confirmingDelete ? (
          <>
            <span className="self-center text-xs text-slate-500">Delete this step?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Yes"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startEditing}
              aria-label={`Edit ${step.label}`}
              title={`Edit ${step.label}`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${step.label}`}
              title={`Delete ${step.label}`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}
