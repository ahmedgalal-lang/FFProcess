"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProcessStep } from "@/lib/actions/process";

type RoleOption = { id: string; name: string };
type StepOption = { id: string; label: string };
type ProcessOption = { id: string; code: string; name: string };

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
              positionX: 0,
              positionY: 0,
              linkedProcessIds,
            },
            fromStepId: fromStepId || undefined,
            connectionLabel: connectionLabel || undefined,
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
                {s.label}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
