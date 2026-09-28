"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addConflict, deleteConflict, updateConflict } from "@/lib/actions/people-governance";
import type { OwnerOptionT } from "./owner-select";

type ConflictStatus = "DECLARED" | "UNDER_REVIEW" | "MITIGATED" | "CLOSED";

export type ConflictT = {
  id: string;
  personId: string;
  personLabel: string;
  description: string;
  relatedParty: string;
  declaredOn: string; // YYYY-MM-DD
  status: ConflictStatus;
  mitigationNote: string | null;
};

const STATUS_LABEL: Record<ConflictStatus, string> = {
  DECLARED: "Declared",
  UNDER_REVIEW: "Under review",
  MITIGATED: "Mitigated",
  CLOSED: "Closed",
};

const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";

/**
 * The conflicts-of-interest register (spec 021): interests declared by people
 * in the directory, followed from Declared to Closed. Open ones (anything
 * not Closed) are listed apart from closed ones.
 */
export function GovernanceConflicts({
  workspaceId,
  conflicts,
  people,
}: {
  workspaceId: string;
  conflicts: ConflictT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : "Could not save.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const open = conflicts.filter((c) => c.status !== "CLOSED");
  const closed = conflicts.filter((c) => c.status === "CLOSED");
  const livePeople = people.filter((p) => !p.archived);

  const renderConflict = (c: ConflictT) => {
    const editing = editingId === c.id;
    const name = `${c.personLabel} – ${c.relatedParty}`;
    return (
      <li key={c.id} data-conflict={name} className="rounded-lg border border-slate-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-900">{c.personLabel}</span>
          <span className="text-slate-600">with {c.relatedParty}</span>
          <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700">{STATUS_LABEL[c.status]}</span>
          <span className="text-slate-600">Declared {c.declaredOn}</span>
          {canEdit && (
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditingId(editing ? null : c.id)}
              className="ml-auto text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {editing ? "Close" : "Update"}
              <span className="sr-only">: {name}</span>
            </button>
          )}
        </div>
        <p className="mt-1 text-slate-700">{c.description}</p>
        {c.mitigationNote && !editing && (
          <p className="mt-1 text-slate-600">
            <span className="font-semibold">Mitigation:</span> {c.mitigationNote}
          </p>
        )}
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              run(
                () =>
                  updateConflict({
                    workspaceId,
                    conflictId: c.id,
                    status: String(data.get("status")) as ConflictStatus,
                    mitigationNote: String(data.get("mitigationNote") ?? ""),
                  }),
                () => setEditingId(null)
              );
            }}
            className="mt-2 flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-2"
          >
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Status
              <select name="status" defaultValue={c.status} className={field}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              How it&apos;s being managed
              <textarea name="mitigationNote" rows={2} defaultValue={c.mitigationNote ?? ""} className={`${field} font-normal`} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending} className={primaryButton}>
                Save conflict
              </button>
              {confirmingDeleteId === c.id ? (
                <>
                  <span className="text-slate-600">Delete this conflict?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteConflict({ workspaceId, conflictId: c.id }), () => setEditingId(null))}
                    className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700"
                  >
                    Delete conflict
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(null)}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600"
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(c.id)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                >
                  Delete…
                </button>
              )}
            </div>
          </form>
        )}
      </li>
    );
  };

  return (
    <section id="conflicts" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Conflicts of interest</h2>
          <p className="text-slate-500">Interests declared by people in the directory, and how each is being managed.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Record conflict
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(
              () =>
                addConflict({
                  workspaceId,
                  personId: String(data.get("personId") ?? ""),
                  description: String(data.get("description") ?? ""),
                  relatedParty: String(data.get("relatedParty") ?? ""),
                  declaredOn: String(data.get("declaredOn") ?? ""),
                }),
              () => setAdding(false)
            );
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Person
              <select name="personId" required defaultValue="" className={field}>
                <option value="" disabled>
                  Choose a person…
                </option>
                {livePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Related party
              <input name="relatedParty" required className={field} />
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Date declared
              <input type="date" name="declaredOn" required className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            The interest
            <textarea name="description" required rows={2} className={`${field} font-normal`} />
          </label>
          <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
            Record conflict
          </button>
        </form>
      )}

      {error && <p className="mb-2 font-medium text-red-600">{error}</p>}

      {conflicts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No conflicts declared.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Open ({open.length})</h3>
            {open.length === 0 ? <p className="text-slate-500">None open.</p> : <ul className="flex flex-col gap-2">{open.map(renderConflict)}</ul>}
          </div>
          {closed.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Closed ({closed.length})</h3>
              <ul className="flex flex-col gap-2">{closed.map(renderConflict)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
