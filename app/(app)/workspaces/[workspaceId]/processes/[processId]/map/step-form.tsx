"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProcessStep, addProcessStepsBulk } from "@/lib/actions/process";

type StepType = "START" | "TASK" | "DECISION" | "END";
type RoleOption = { id: string; name: string };
type StepOption = { id: string; label: string; type: StepType };
type ProcessOption = { id: string; code: string; name: string };

const STEP_TYPE_PREFIX: Record<StepType, string> = {
  START: "Start",
  TASK: "Task",
  DECISION: "Decision",
  END: "End",
};

export function AddStepForm({
  workspaceId,
  processId,
  roles,
  steps,
  otherProcesses,
}: {
  workspaceId: string;
  processId: string;
  roles: RoleOption[];
  steps: StepOption[];
  otherProcesses: ProcessOption[];
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"TASK" | "DECISION" | "START" | "END">("TASK");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [fromStepId, setFromStepId] = useState(steps.at(-1)?.id ?? "");
  const [connectionLabel, setConnectionLabel] = useState("");
  // Where the step lands in the Steps List. "AUTO" puts it straight after
  // whatever it connects from, which is almost always where it belongs — the
  // common case being a step remembered late that would otherwise be stranded
  // at the bottom. "END" is the old behaviour, kept for when that's wanted.
  const [insertAfter, setInsertAfter] = useState<string>("AUTO");
  const [linkedProcessIds, setLinkedProcessIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addProcessStep({
            workspaceId,
            processId,
            step: {
              type,
              label,
              assignedRoleId: roleId || undefined,
              swimlaneRoleId: roleId || undefined,
              linkedProcessIds,
            },
            fromStepId: fromStepId || undefined,
            connectionLabel: connectionLabel || undefined,
            insertAfterStepId:
              insertAfter === "AUTO" ? fromStepId || undefined : insertAfter === "END" ? undefined : insertAfter,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid step" : result.error);
            return;
          }
          setLabel("");
          setConnectionLabel("");
          setLinkedProcessIds([]);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Step name">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            placeholder="e.g. Confirm Delivery"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
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
            {steps.map((s) => (
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
        <Field label="Insert">
          <select
            value={insertAfter}
            onChange={(e) => setInsertAfter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="AUTO">after the step it connects from</option>
            <option value="END">at the end of the list</option>
            {steps.map((s) => (
              <option key={s.id} value={s.id}>
                after [{STEP_TYPE_PREFIX[s.type]}] {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {otherProcesses.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Link to other process(es)</span>
          <div className="flex flex-wrap gap-3">
            {otherProcesses.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={linkedProcessIds.includes(p.id)}
                  onChange={(e) =>
                    setLinkedProcessIds((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                    )
                  }
                />
                {p.code} — {p.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          + Add Step
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

export function BulkAddStepsForm({ workspaceId, processId }: { workspaceId: string; processId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAddedCount(null);
          }}
          className="self-start rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          + Add multiple steps at once
        </button>
        {addedCount !== null && (
          <span className="text-xs text-emerald-700">
            Added {addedCount} step{addedCount === 1 ? "" : "s"} — edit them in the Steps List below.
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addProcessStepsBulk({ workspaceId, processId, labels: lines });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid step list") : result.error);
            return;
          }
          setAddedCount(result.data.ids.length);
          setText("");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        One step per line — each is added as a Task, chained to the one before it
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={"Receive requisition\nCheck budget\nApprove or reject\nNotify requester"}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="self-start rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding…" : `Add ${lines.length} step${lines.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setText("");
            setError(null);
          }}
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <p className="text-xs text-slate-500">
        All added as plain Task steps — use Steps List below to set each one&rsquo;s type, role, and connector.
      </p>
    </form>
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
