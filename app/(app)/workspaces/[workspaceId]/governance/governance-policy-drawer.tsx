"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { deleteGovernancePolicy, updatePolicyDraft } from "@/lib/actions/governance";

export type PolicyT = {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "EDITED" | "DONE" | "DISMISSED";
  /** The focus area whose assessment drafted it, or null when written by hand. */
  focusAreaLabel: string | null;
  updatedAt: string;
};

const STATUS_LABEL: Record<string, string> = { OPEN: "Draft", EDITED: "Edited" };
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  EDITED: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

/**
 * A full draft policy, opened from a checklist item or from the Policy
 * Library. Editing and saving sets status to EDITED, which is what protects
 * it from being overwritten by a later assessment run (SC-004) — see
 * governance-findings.ts's isHandManaged.
 *
 * The caller keys this on the open policy's id, so switching which policy is
 * open remounts it with fresh state rather than needing an effect to reset
 * `body`/`editing`/`error` when `policy` changes under an already-mounted
 * instance.
 */
export function GovernancePolicyDrawer({
  workspaceId,
  policy,
  onClose,
}: {
  workspaceId: string;
  policy: PolicyT | null;
  onClose: () => void;
}) {
  const canEdit = useCanEdit();
  const [title, setTitle] = useState(policy?.title ?? "");
  const [body, setBody] = useState(policy?.body ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!policy) return null;

  function save() {
    if (!policy) return;
    setError(null);
    startTransition(async () => {
      const result = await updatePolicyDraft({ workspaceId, policyId: policy.id, title, body });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!policy) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGovernancePolicy({ workspaceId, policyId: policy.id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not delete.") : result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={policy.title}
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wide text-indigo-600">
              {policy.focusAreaLabel ?? "Added manually"}
            </div>
            {editing ? (
              <input
                aria-label="Policy title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-base font-bold text-slate-900"
              />
            ) : (
              <h3 className="text-base font-bold text-slate-900">{policy.title}</h3>
            )}
          </div>
          <span
            className={`flex-none rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${STATUS_STYLE[policy.status] ?? STATUS_STYLE["OPEN"]}`}
          >
            {STATUS_LABEL[policy.status] ?? policy.status}
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {editing ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed text-slate-800"
            />
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{policy.body}</div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Edit
            </button>
          )}
          {canEdit && editing && (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {canEdit &&
            (confirmingDelete ? (
              <span className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                Delete this policy?
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                >
                  {pending ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="ml-auto text-xs font-semibold text-slate-500 hover:text-red-600"
              >
                Delete
              </button>
            ))}
          {error && <span className="text-xs font-medium text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
