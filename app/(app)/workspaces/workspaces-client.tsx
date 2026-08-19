"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createWorkspace, deleteWorkspace } from "@/lib/actions/organization";

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        + New Client
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createWorkspace({ name, industry, description });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setIndustry("");
          setDescription("");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Client name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Industrial"
            required
            autoFocus
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Industry / sector
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Manufacturing"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        About this organization <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Size, specific practices, sector nuances — helps AI Review tailor its suggestions to this client."
          rows={2}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

export function DeleteWorkspaceButton({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // The dialog is portaled to document.body (see below) so its clicks can never bubble
  // into the workspace card's <Link>, which is what caused "Delete" to navigate into the
  // workspace instead of deleting it. `open` only ever flips true from a click handler,
  // so `document` is guaranteed to exist by then — no SSR/mount guard needed.
  function close() {
    setOpen(false);
    setConfirmName("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Delete ${workspaceName}`}
        title={`Delete ${workspaceName}`}
        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <h2 id="delete-workspace-title" className="text-sm font-semibold text-slate-900">
                Delete {workspaceName}?
              </h2>
              <p className="mt-1.5 text-xs text-slate-500">
                This permanently deletes the workspace and everything in it — members, roles, processes,
                RACI matrices, and the authority matrix. This cannot be undone.
              </p>
              <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-slate-600">
                Type <span className="font-mono font-semibold text-slate-900">{workspaceName}</span> to confirm
                <input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoFocus
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                />
              </label>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || confirmName !== workspaceName}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startTransition(async () => {
                      setError(null);
                      const result = await deleteWorkspace({ workspaceId, confirmName });
                      if (!result.ok) {
                        setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not delete" : result.error);
                        return;
                      }
                      close();
                      router.refresh();
                    });
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
