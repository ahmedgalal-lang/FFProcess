"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProcess, cloneProcess } from "@/lib/actions/process";
import { createProcessCategory } from "@/lib/actions/process-category";

type ProcessOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; name: string };

export function CreateProcessForm({
  workspaceId,
  processes,
  categories,
}: {
  workspaceId: string;
  processes: ProcessOption[];
  categories: CategoryOption[];
}) {
  const [name, setName] = useState("");
  const [parentProcessId, setParentProcessId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryPending, startCategoryTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addCategory() {
    if (!newCategoryName.trim()) return;
    setCategoryError(null);
    startCategoryTransition(async () => {
      const result = await createProcessCategory({ workspaceId, name: newCategoryName });
      if (!result.ok) {
        setCategoryError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid category") : result.error);
        return;
      }
      setCategoryOptions((prev) =>
        prev.some((c) => c.id === result.data.id) ? prev : [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setCategoryId(result.data.id);
      setNewCategoryName("");
      setNewCategoryOpen(false);
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setLastCreatedCode(null);
        startTransition(async () => {
          const result = await createProcess({
            workspaceId,
            name,
            parentProcessId: parentProcessId || undefined,
            categoryId: categoryId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setParentProcessId("");
          setLastCreatedCode(result.data.code);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Order Fulfillment"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Category
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— none —</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Parent process
        <select
          value={parentProcessId}
          onChange={(e) => setParentProcessId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— top-level —</option>
          {processes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        + New Process
      </button>

      {newCategoryOpen ? (
        <div className="flex items-end gap-1.5">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            New category name
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. HR"
              autoFocus
              className="w-32 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={addCategory}
            disabled={categoryPending}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {categoryPending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setNewCategoryOpen(false);
              setNewCategoryName("");
              setCategoryError(null);
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNewCategoryOpen(true)}
          className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          + New category
        </button>
      )}

      <span className="self-center text-xs text-slate-500">Codes are assigned automatically.</span>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
      {categoryError && <span className="w-full text-xs text-red-600">{categoryError}</span>}
      {lastCreatedCode && (
        <span className="w-full text-xs text-emerald-700">
          Created as <span className="font-mono font-semibold">{lastCreatedCode}</span>.
        </span>
      )}
    </form>
  );
}

export function CloneProcessButton({
  workspaceId,
  sourceProcessId,
  sourceName,
  sourceParentProcessId,
  processes,
}: {
  workspaceId: string;
  sourceProcessId: string;
  sourceName: string;
  sourceParentProcessId: string | null;
  processes: ProcessOption[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${sourceName} (Copy)`);
  const [parentProcessId, setParentProcessId] = useState(sourceParentProcessId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(`${sourceName} (Copy)`);
          setParentProcessId(sourceParentProcessId ?? "");
          setError(null);
          setOpen(true);
        }}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        Clone
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Clone ${sourceName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => setOpen(false)}
    >
      <form
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await cloneProcess({
              workspaceId,
              sourceProcessId,
              name,
              parentProcessId: parentProcessId || undefined,
            });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not clone" : result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Clone &ldquo;{sourceName}&rdquo;</h2>
        <p className="mt-1 text-xs text-slate-500">
          Copies its steps, connections, cross-process links, and RACI assignments into a new process with
          its own code.
        </p>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          New process name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          Parent process
          <select
            value={parentProcessId}
            onChange={(e) => setParentProcessId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— top-level —</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Cloning…" : "Clone"}
          </button>
        </div>
      </form>
    </div>
  );
}
