"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPhase, importValueChain, type ImportPreview } from "@/lib/actions/value-chain";
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
          Add a phase
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

      {open === "phases" && <AddPhaseForm workspaceId={workspaceId} phases={phases} />}
      {open === "import" && <ImportPanel workspaceId={workspaceId} processes={processes} />}
    </div>
  );
}

/**
 * Adding a stage. Renaming one, moving it along the chain and deleting it are
 * on the board's own column headers — where someone is looking when they decide
 * a stage is misnamed or in the wrong place — rather than duplicated here.
 */
function AddPhaseForm({ workspaceId, phases }: { workspaceId: string; phases: PhaseRef[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <h2 className="text-sm font-semibold text-slate-900">Phases</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        {phases.length === 0
          ? "The stages of the value chain. Add the first one and it becomes a column on the board."
          : `${phases.map((phase) => phase.name).join(" → ")}. Rename, reorder or delete a stage from its column on the board below.`}
      </p>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createPhase({ workspaceId, name });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not add") : result.error);
              return;
            }
            setName("");
            router.refresh();
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
