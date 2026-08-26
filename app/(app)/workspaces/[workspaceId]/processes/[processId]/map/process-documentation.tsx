"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProcessScope } from "@/lib/actions/process";

type Entity = { name: string; description: string };

export function ProcessDocumentation({
  workspaceId,
  processId,
  processPurpose,
  inScope,
  outOfScope,
  externalEntities,
}: {
  workspaceId: string;
  processId: string;
  processPurpose: string | null;
  inScope: string[];
  outOfScope: string[];
  externalEntities: Entity[];
}) {
  const [editing, setEditing] = useState(false);
  const [purposeInput, setPurposeInput] = useState(processPurpose ?? "");
  const [inScopeInput, setInScopeInput] = useState(inScope.join("\n"));
  const [outOfScopeInput, setOutOfScopeInput] = useState(outOfScope.join("\n"));
  const [entitiesInput, setEntitiesInput] = useState<Entity[]>(externalEntities);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setPurposeInput(processPurpose ?? "");
    setInScopeInput(inScope.join("\n"));
    setOutOfScopeInput(outOfScope.join("\n"));
    setEntitiesInput(externalEntities);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProcessScope({
        workspaceId,
        processId,
        processPurpose: purposeInput,
        inScope: inScopeInput.split("\n").map((s) => s.trim()).filter(Boolean),
        outOfScope: outOfScopeInput.split("\n").map((s) => s.trim()).filter(Boolean),
        externalEntities: entitiesInput.filter((e) => e.name.trim() && e.description.trim()),
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid input") : result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function updateEntity(i: number, patch: Partial<Entity>) {
    setEntitiesInput((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  if (editing) {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Process Documentation</div>
        <p className="text-xs text-slate-500">
          Feeds the Export Report&rsquo;s Executive Summary and Involved Parties sections.
        </p>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Process Purpose
          <textarea
            value={purposeInput}
            onChange={(e) => setPurposeInput(e.target.value)}
            placeholder="Why this process exists and what it standardizes."
            rows={3}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            In-Scope (one per line)
            <textarea
              value={inScopeInput}
              onChange={(e) => setInScopeInput(e.target.value)}
              rows={3}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Out-of-Scope (one per line)
            <textarea
              value={outOfScopeInput}
              onChange={(e) => setOutOfScopeInput(e.target.value)}
              rows={3}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">External Entities</div>
          <div className="mt-1.5 space-y-2">
            {entitiesInput.map((entity, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={entity.name}
                  aria-label="Entity name"
                  onChange={(e) => updateEntity(i, { name: e.target.value })}
                  placeholder="Entity name"
                  className="w-40 flex-none rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
                <input
                  value={entity.description}
                  aria-label="Entity description"
                  onChange={(e) => updateEntity(i, { description: e.target.value })}
                  placeholder="One sentence on its role"
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setEntitiesInput((items) => items.filter((_, idx) => idx !== i))}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEntitiesInput((items) => [...items, { name: "", description: "" }])}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              + Add entity
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setEditing(false);
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

  const hasContent = processPurpose || inScope.length > 0 || outOfScope.length > 0 || externalEntities.length > 0;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">Process Documentation</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit process documentation"
          className="flex-none rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Edit
        </button>
      </div>
      {!hasContent ? (
        <p className="mt-1.5 text-sm text-slate-500">
          Not documented yet — add a Purpose, Scope, and External Entities for the Export Report.
        </p>
      ) : (
        <div className="mt-2 space-y-2 text-sm text-slate-700">
          {processPurpose && <p>{processPurpose}</p>}
          {(inScope.length > 0 || outOfScope.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">In-Scope</div>
                <ul className="list-disc pl-4 text-xs">
                  {inScope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Out-of-Scope</div>
                <ul className="list-disc pl-4 text-xs">
                  {outOfScope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {externalEntities.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">External Entities</div>
              <ul className="text-xs">
                {externalEntities.map((entity, i) => (
                  <li key={i}>
                    <strong>{entity.name}</strong> — {entity.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
