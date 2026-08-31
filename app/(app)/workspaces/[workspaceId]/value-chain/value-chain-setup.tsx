"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPhase, deletePhase, importValueChain, movePhase, type ImportPreview } from "@/lib/actions/value-chain";
import type { PhaseRef } from "@/lib/domain/value-chain";

type ProcessRef = { id: string; code: string; name: string };

/** Managing the chain itself — its phases, and importing one from a spreadsheet. */
export function ValueChainSetup({
  workspaceId,
  phases,
  processes,
}: {
  workspaceId: string;
  phases: PhaseRef[];
  processes: ProcessRef[];
}) {
  const [open, setOpen] = useState<"phases" | "import" | null>(null);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === "phases" ? null : "phases")}
          aria-expanded={open === "phases"}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Manage phases
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "import" ? null : "import")}
          aria-expanded={open === "import"}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Import from spreadsheet
        </button>
      </div>

      {open === "phases" && <PhaseManager workspaceId={workspaceId} phases={phases} />}
      {open === "import" && <ImportPanel workspaceId={workspaceId} processes={processes} />}
    </div>
  );
}

function PhaseManager({ workspaceId, phases }: { workspaceId: string; phases: PhaseRef[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save") : result.error!);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <h2 className="text-sm font-semibold text-slate-900">Phases</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        The stages of the value chain, left to right. Deleting one leaves its activities in place, unphased.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {phases.map((phase, index) => (
          <li key={phase.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
            {phase.color && (
              <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: phase.color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{phase.name}</span>
            <button
              type="button"
              disabled={pending || index === 0}
              onClick={() => run(() => movePhase({ workspaceId, phaseId: phase.id, direction: "LEFT" }))}
              aria-label={`Move ${phase.name} earlier`}
              className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:invisible"
            >
              ←
            </button>
            <button
              type="button"
              disabled={pending || index === phases.length - 1}
              onClick={() => run(() => movePhase({ workspaceId, phaseId: phase.id, direction: "RIGHT" }))}
              aria-label={`Move ${phase.name} later`}
              className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:invisible"
            >
              →
            </button>
            {confirming === phase.id ? (
              <>
                <span className="text-[11px] text-slate-600">Delete?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setConfirming(null);
                    run(() => deletePhase({ workspaceId, phaseId: phase.id }));
                  }}
                  className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(phase.id)}
                aria-label={`Delete ${phase.name}`}
                className="rounded px-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {phases.length === 0 && <li className="text-xs text-slate-600">No phases yet.</li>}
      </ul>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createPhase({ workspaceId, name });
            if (result.ok) setName("");
            return result;
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          New phase
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Initiation"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Add phase
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ImportPanel({ workspaceId, processes }: { workspaceId: string; processes: ProcessRef[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processName, setProcessName] = useState("");
  const [processId, setProcessId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(dryRun: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a spreadsheet first.");
      return;
    }
    setError(null);
    setDone(null);

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("file", file);
    formData.set("dryRun", String(dryRun));
    if (processId) formData.set("processId", processId);
    else if (processName) formData.set("processName", processName);

    startTransition(async () => {
      const result = await importValueChain(formData);
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not import") : result.error);
        return;
      }
      setPreview(result.data.preview);
      if (result.data.created) {
        setDone(`Imported ${result.data.created.activities} activities.`);
        setPreview(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <h2 className="text-sm font-semibold text-slate-900">Import a value chain</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        An .xlsx whose sheet has a header row with a <strong>Phase</strong> column and a{" "}
        <strong>Step / Activity</strong> column; Primary Owner, Supporting Departments and Description come
        across too when they&apos;re there. Nothing is overwritten — a phase or department that already
        exists here is reused.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Spreadsheet
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={() => {
              setPreview(null);
              setDone(null);
            }}
            className="text-xs text-slate-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Land the activities on
          <select
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— a new process —</option>
            {processes.map((process) => (
              <option key={process.id} value={process.id}>
                {process.code} — {process.name}
              </option>
            ))}
          </select>
        </label>
        {!processId && (
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            New process name
            <input
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              placeholder="e.g. Integrated Value Chain"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending ? "Reading…" : "Preview"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {done && <p className="mt-2 text-xs font-semibold text-emerald-700">{done}</p>}

      {preview && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-700">
            Found <strong>{preview.plan.activities.length}</strong> activities on sheet{" "}
            <strong>{preview.sheetName}</strong>, in {preview.plan.phases.length} phases.
          </p>
          <p className="mt-1.5 text-[11px] text-slate-600">
            <span className="font-semibold">Phases:</span> {preview.plan.phases.join(" → ")}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            <span className="font-semibold">Departments ({preview.plan.departments.length}):</span>{" "}
            {preview.plan.departments.join(", ")}
          </p>
          {preview.existingPhases.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-600">
              Reusing existing phases: {preview.existingPhases.join(", ")}
            </p>
          )}
          {preview.existingDepartments.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-600">
              Reusing existing departments: {preview.existingDepartments.join(", ")}
            </p>
          )}
          {preview.plan.skipped.length > 0 && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-amber-800">
                {preview.plan.skipped.length} row{preview.plan.skipped.length === 1 ? "" : "s"} will be skipped
              </p>
              <ul className="mt-0.5 list-inside list-disc text-[11px] text-amber-800">
                {preview.plan.skipped.slice(0, 5).map((s) => (
                  <li key={s.sourceRow}>
                    Row {s.sourceRow}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            disabled={pending || preview.plan.activities.length === 0}
            onClick={() => submit(false)}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Importing…" : `Import ${preview.plan.activities.length} activities`}
          </button>
        </div>
      )}
    </div>
  );
}
