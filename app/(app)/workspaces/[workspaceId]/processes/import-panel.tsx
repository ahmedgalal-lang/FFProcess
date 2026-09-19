"use client";

import { useRef, useState, useTransition } from "react";
import { importProcess, type ImportSummary } from "@/lib/actions/process-import";

/**
 * Download a template, fill it in offline, upload it, see exactly what will
 * happen, and confirm.
 *
 * The confirm control is not rendered at all while the file has any problem in
 * it — a disabled button invites a click and then refuses it, which reads as
 * the product being broken rather than the file being wrong. The server
 * refuses a problematic commit regardless of what this panel shows.
 */
export function ImportPanel({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<{ code: string; processId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [committing, startCommit] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);


  function reset() {
    setSummary(null);
    setDone(null);
    setError(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(dryRun: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a filled-in template to import.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("dryRun", String(dryRun));
    formData.set("file", file);

    const run = () => {
      void importProcess(formData).then((result) => {
        if (!result.ok) {
          setError(
            "message" in result && result.message
              ? result.message
              : result.error === "FORBIDDEN"
                ? "You need edit access to import a process."
                : "That import could not be completed."
          );
          if (dryRun) setSummary(null);
          return;
        }
        setSummary(result.data.summary);
        if (result.data.created) setDone(result.data.created);
      });
    };

    if (dryRun) startPreview(run);
    else startCommit(run);
  }

  const importable = summary !== null && summary.problems.length === 0 && summary.stepCount > 0;

  return (
    <section
      aria-labelledby="process-import-heading"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="process-import-heading" className="text-sm font-semibold text-slate-900">
            Build a process from a spreadsheet
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Download the template, fill it in, and upload it — the whole process is created in one go.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/template/process-import/${workspaceId}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Download template
          </a>
          <button
            type="button"
            onClick={() => {
              if (open) reset();
              setOpen(!open);
            }}
            aria-expanded={open}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {open ? "Close" : "Import from a file"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <label
            htmlFor="process-import-file"
            className="block text-xs font-semibold text-slate-700"
          >
            Filled-in template (.xlsx)
          </label>
          <input
            id="process-import-file"
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setSummary(null);
              setDone(null);
              setError(null);
            }}
            className="mt-1 block w-full max-w-md text-xs text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-50"
          />

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={previewing || !fileName}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {previewing ? "Checking…" : "Check this file"}
            </button>
            {(summary || error) && (
              // Its own pending flag, not the shared one: a Cancel that goes
              // disabled while a request is in flight cannot take focus, which
              // strands a keyboard user mid-import.
              <button
                type="button"
                onClick={reset}
                disabled={committing}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Cancel
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}

          {done && summary && (
            <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              Created {summary.processName} ({done.code}) — {summary.stepCount} steps,{" "}
              {summary.raciCount} RACI assignments, {summary.authorityRuleCount} authority rules.{" "}
              <a className="underline" href={`/workspaces/${workspaceId}/processes/${done.processId}/map`}>
                Open the process map
              </a>
            </p>
          )}

          {summary && !done && <Summary summary={summary} importable={importable} />}

          {summary && !done && importable && (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={committing}
              className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              {committing ? "Importing…" : `Create ${summary.processName}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Summary({ summary, importable }: { summary: ImportSummary; importable: boolean }) {
  return (
    <div className="mt-3">
      {summary.problems.length > 0 ? (
        <div role="alert">
          <h3 className="text-xs font-semibold text-rose-800">
            {summary.problems.length} problem{summary.problems.length === 1 ? "" : "s"} in that file — nothing
            has been created
          </h3>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-rose-200">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Problems found in the uploaded file, with the sheet and row each is on
              </caption>
              <thead className="bg-rose-50 text-[11px] font-semibold uppercase tracking-wide text-rose-900">
                <tr>
                  <th scope="col" className="px-3 py-1.5">Sheet</th>
                  <th scope="col" className="px-3 py-1.5">Row</th>
                  <th scope="col" className="px-3 py-1.5">What is wrong</th>
                </tr>
              </thead>
              <tbody>
                {summary.problems.map((problem, i) => (
                  <tr key={`${problem.source.sheet}-${problem.source.row}-${i}`} className="border-t border-rose-100">
                    <td className="px-3 py-1.5 font-semibold text-slate-800">{problem.source.sheet}</td>
                    <td className="px-3 py-1.5 tabular-nums text-slate-700">{problem.source.row}</td>
                    <td className="px-3 py-1.5 text-slate-700">{problem.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Fix these in the workbook and upload it again. Nothing is created until the file is clean.
          </p>
        </div>
      ) : (
        <div role="status">
          <h3 className="text-xs font-semibold text-slate-900">
            {importable ? "This is what will be created" : "Nothing to import"}
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            <Fact label="Process" value={summary.processName} />
            <Fact label="Steps" value={String(summary.stepCount)} />
            <Fact label="Connections" value={String(summary.connectionCount)} />
            <Fact label="RACI assignments" value={String(summary.raciCount)} />
            <Fact label="Authority rules" value={String(summary.authorityRuleCount)} />
            <Fact label="KPIs / entities" value={`${summary.kpiCount} / ${summary.externalEntityCount}`} />
          </dl>

          <NameList label="Roles already in this workspace" names={summary.existingRoles} />
          <NameList label="Roles that will be created" names={summary.newRoles} emphasise />
          <NameList label="People already in this workspace" names={summary.existingPeople} />
          <NameList label="People that will be created" names={summary.newPeople} emphasise />

          {summary.nameAlreadyExists && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              A process called <strong>{summary.processName}</strong> already exists here. Importing creates a
              separate process — the existing one is not changed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

function NameList({ label, names, emphasise }: { label: string; names: string[]; emphasise?: boolean }) {
  if (names.length === 0) return null;
  return (
    <p className="mt-2 text-xs">
      {/* The count is stated in words as well as colour, so "new" does not
          depend on the amber alone. */}
      <span className={emphasise ? "font-semibold text-amber-800" : "font-semibold text-slate-600"}>
        {label} ({names.length}):
      </span>{" "}
      <span className="text-slate-700">{names.join(", ")}</span>
    </p>
  );
}
