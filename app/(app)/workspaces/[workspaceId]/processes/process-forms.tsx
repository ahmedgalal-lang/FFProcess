"use client";

import { useCanEdit } from "../workspace-access";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProcess,
  cloneProcess,
  updateProcess,
  archiveProcess,
  getProcessDeleteImpact,
} from "@/lib/actions/process";
import type { ProcessDeleteImpact } from "@/lib/domain/process-delete-impact";
import { createProcessCategory } from "@/lib/actions/process-category";

type StepOption = { id: string; label: string };
type ProcessOption = { id: string; code: string; name: string; steps?: StepOption[] };
type CategoryOption = { id: string; name: string };

/**
 * Optional "this process picks up mid-flow in another one" pair of selects.
 * Two dependent dropdowns rather than one long flat list, because a workspace
 * with several 17-step processes would otherwise produce an unusable menu.
 * `excludeProcessId` keeps a process from offering its own steps.
 */
function BranchFromFields({
  processes,
  excludeProcessId,
  sourceProcessId,
  stepId,
  onChange,
}: {
  processes: ProcessOption[];
  excludeProcessId?: string;
  sourceProcessId: string;
  stepId: string;
  onChange: (next: { sourceProcessId: string; stepId: string }) => void;
}) {
  const candidates = processes.filter((p) => p.id !== excludeProcessId && (p.steps?.length ?? 0) > 0);
  const steps = candidates.find((p) => p.id === sourceProcessId)?.steps ?? [];

  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Branches from
        <select
          value={sourceProcessId}
          onChange={(e) => onChange({ sourceProcessId: e.target.value, stepId: "" })}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— starts on its own —</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      {sourceProcessId && (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Starts at step
          <select
            value={stepId}
            onChange={(e) => onChange({ sourceProcessId, stepId: e.target.value })}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— pick a step —</option>
            {steps.map((step, i) => (
              <option key={step.id} value={step.id}>
                {i + 1} · {step.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

export function CreateProcessForm({
  workspaceId,
  processes,
  categories,
}: {
  workspaceId: string;
  processes: ProcessOption[];
  categories: CategoryOption[];
}) {
  const canEdit = useCanEdit();
  const [name, setName] = useState("");
  const [parentProcessId, setParentProcessId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [branch, setBranch] = useState({ sourceProcessId: "", stepId: "" });
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryPending, startCategoryTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Nothing here but a way to change something, so a Viewer is shown none
  // of it rather than controls the server would refuse.
  if (!canEdit) return null;

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
            branchFromStepId: branch.stepId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setParentProcessId("");
          setBranch({ sourceProcessId: "", stepId: "" });
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
      <BranchFromFields
        processes={processes}
        sourceProcessId={branch.sourceProcessId}
        stepId={branch.stepId}
        onChange={setBranch}
      />
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
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${sourceName} (Copy)`);
  const [parentProcessId, setParentProcessId] = useState(sourceParentProcessId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Nothing here but a way to change something, so a Viewer is shown none
  // of it rather than controls the server would refuse.
  if (!canEdit) return null;

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

export function EditProcessButton({
  workspaceId,
  process,
  processes,
  categories,
}: {
  workspaceId: string;
  process: {
    id: string;
    name: string;
    description: string;
    categoryId: string | null;
    parentProcessId: string | null;
    branchFromStepId: string | null;
    branchFromProcessId: string | null;
  };
  processes: ProcessOption[];
  categories: CategoryOption[];
}) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(process.name);
  const [description, setDescription] = useState(process.description);
  const [categoryId, setCategoryId] = useState(process.categoryId ?? "");
  const [parentProcessId, setParentProcessId] = useState(process.parentProcessId ?? "");
  const [branch, setBranch] = useState({
    sourceProcessId: process.branchFromProcessId ?? "",
    stepId: process.branchFromStepId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Nothing here but a way to change something, so a Viewer is shown none
  // of it rather than controls the server would refuse.
  if (!canEdit) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(process.name);
          setDescription(process.description);
          setCategoryId(process.categoryId ?? "");
          setParentProcessId(process.parentProcessId ?? "");
          setBranch({
            sourceProcessId: process.branchFromProcessId ?? "",
            stepId: process.branchFromStepId ?? "",
          });
          setError(null);
          setOpen(true);
        }}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        Edit
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${process.name}`}
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
            const result = await updateProcess({
              workspaceId,
              processId: process.id,
              name,
              description,
              categoryId: categoryId || null,
              parentProcessId: parentProcessId || null,
              branchFromStepId: branch.stepId || null,
            });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save") : result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Edit &ldquo;{process.name}&rdquo;</h2>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
          Parent process
          <select
            value={parentProcessId}
            onChange={(e) => setParentProcessId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— top-level —</option>
            {processes
              .filter((p) => p.id !== process.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
          </select>
        </label>
        <div className="mt-3 flex flex-col gap-3">
          <BranchFromFields
            processes={processes}
            excludeProcessId={process.id}
            sourceProcessId={branch.sourceProcessId}
            stepId={branch.stepId}
            onChange={setBranch}
          />
        </div>
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
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ArchiveProcessButton({
  workspaceId,
  processId,
}: {
  workspaceId: string;
  processId: string;
}) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<ProcessDeleteImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Loading the summary is tracked apart from running the delete. Sharing one
   * transition meant Cancel was disabled while the counts were still arriving —
   * and a disabled button cannot take focus, so opening the dialog by keyboard
   * left focus on the document body with nothing to tab from.
   */
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Nothing here but a way to change something, so a Viewer is shown none
  // of it rather than controls the server would refuse.
  const close = useCallback(() => {
    setOpen(false);
    setImpact(null);
    setError(null);
    setLoading(false);
  }, []);

  // Focus lands on Cancel, not Delete: the dialog exists to give someone a
  // chance to stop, so the keyboard should not open it with the destructive
  // button already under Enter.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!canEdit) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setLoading(true);
          // Gathered now rather than shipped with the list: five counts per row
          // to serve a dialog most rows never open is the wrong trade.
          void getProcessDeleteImpact({ workspaceId, processId }).then((result) => {
            if (result.ok) setImpact(result.data);
            else setError("Could not read what this process holds");
            setLoading(false);
          });
        }}
        className="text-xs font-semibold text-slate-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Delete
      </button>
    );
  }

  const label = impact ? `${impact.code} \u00b7 ${impact.name}` : "this process";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${label}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-left shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900">Delete &ldquo;{label}&rdquo;?</h2>

        {loading && <p className="mt-2 text-sm text-slate-600">Checking what this process holds…</p>}

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {impact && (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {impact.isEmpty ? (
              <p>This process is empty — there is nothing recorded against it yet.</p>
            ) : (
              <p>
                It holds <strong className="font-semibold text-slate-900">{listOut(impact.carries)}</strong>,
                which will stop appearing in reports, exports and the value chain.
              </p>
            )}

            {impact.leavesBehind.map((sentence) => (
              <p key={sentence} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
                {sentence}
              </p>
            ))}

            <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700">
              Nothing is destroyed. You can bring this process back, exactly as it is now, from{" "}
              <strong className="font-semibold text-slate-900">Deleted processes</strong> on the Processes
              page.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || loading}
            onClick={() =>
              startTransition(async () => {
                const result = await archiveProcess({ workspaceId, processId });
                if (!result.ok) {
                  setError("Could not delete this process");
                  return;
                }
                close();
                router.refresh();
              })
            }
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete process"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "14 steps, 26 RACI assignments and 4 authority rules" */
function listOut(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
