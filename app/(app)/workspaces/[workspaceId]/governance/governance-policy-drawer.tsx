"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit, useWorkspaceAccess } from "../workspace-access";
import {
  deleteGovernancePolicy,
  updatePolicyDraft,
  submitPolicyForReview,
  approvePolicyDraft,
  publishPolicyDraft,
  retirePolicyDraft,
  setPolicyReviewDueDate,
  markPolicyAcknowledgement,
  unmarkPolicyAcknowledgement,
} from "@/lib/actions/governance";

export type PolicyVersionT = {
  versionNumber: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type PolicyAcknowledgementT = {
  personId: string;
  personName: string;
  acknowledgedAt: string;
};

export type PolicyT = {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "EDITED" | "DONE" | "DISMISSED";
  /** The focus area whose assessment drafted it, or null when written by hand. */
  focusAreaLabel: string | null;
  /** The same focus area as focusAreaLabel, as its raw value — for filtering by the active tab. */
  focusArea: string | null;
  updatedAt: string;
  /** Policy Lifecycle (spec 018) — independent of `status` above. */
  lifecycleStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED";
  approvedByUserName: string | null;
  approvedAt: string | null;
  effectiveDate: string | null;
  reviewDueDate: string | null;
  needsReview: boolean;
  versions: PolicyVersionT[];
  acknowledgements: PolicyAcknowledgementT[];
  /** Spec 029: the aspect this policy governs, if any. */
  governsAspectId: string | null;
  governsAspectName: string | null;
};

const STATUS_LABEL: Record<string, string> = { OPEN: "Draft", EDITED: "Edited" };
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  EDITED: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const LIFECYCLE_LABEL: Record<PolicyT["lifecycleStatus"], string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  RETIRED: "Retired",
};
const LIFECYCLE_STYLE: Record<PolicyT["lifecycleStatus"], string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  IN_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RETIRED: "bg-slate-100 text-slate-500 border-slate-200",
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
  people,
  onClose,
}: {
  workspaceId: string;
  policy: PolicyT | null;
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const canEdit = useCanEdit();
  const isAdmin = useWorkspaceAccess().accessLevel === "ADMIN";
  const [title, setTitle] = useState(policy?.title ?? "");
  const [body, setBody] = useState(policy?.body ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reviewDueDateDraft, setReviewDueDateDraft] = useState(policy?.reviewDueDate ?? "");
  const [showVersions, setShowVersions] = useState(false);
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

  function runLifecycleAction(
    action: (input: { workspaceId: string; policyId: string }) => Promise<{ ok: boolean; error?: string; message?: string }>
  ) {
    if (!policy) return;
    setError(null);
    startTransition(async () => {
      const result = await action({ workspaceId, policyId: policy.id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not update.") : (result.error ?? "Could not update."));
        return;
      }
      router.refresh();
    });
  }

  function saveReviewDueDate() {
    if (!policy) return;
    setError(null);
    startTransition(async () => {
      const result = await setPolicyReviewDueDate({
        workspaceId,
        policyId: policy.id,
        reviewDueDate: reviewDueDateDraft || null,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleAcknowledgement(personId: string, acknowledged: boolean) {
    if (!policy) return;
    setError(null);
    startTransition(async () => {
      const action = acknowledged ? unmarkPolicyAcknowledgement : markPolicyAcknowledgement;
      const result = await action({ workspaceId, policyId: policy.id, personId });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not update.") : result.error);
        return;
      }
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
          <div className="flex flex-none flex-col items-end gap-1">
            <span
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${LIFECYCLE_STYLE[policy.lifecycleStatus]}`}
            >
              {LIFECYCLE_LABEL[policy.lifecycleStatus]}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${STATUS_STYLE[policy.status] ?? STATUS_STYLE["OPEN"]}`}
            >
              {STATUS_LABEL[policy.status] ?? policy.status}
            </span>
          </div>
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

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
            {(policy.approvedByUserName || policy.effectiveDate || policy.needsReview) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {policy.approvedByUserName && (
                  <span>
                    Approved by {policy.approvedByUserName}
                    {policy.approvedAt ? ` on ${policy.approvedAt}` : ""}
                  </span>
                )}
                {policy.effectiveDate && <span>Effective {policy.effectiveDate}</span>}
                {policy.needsReview && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-red-700">
                    Needs review
                  </span>
                )}
              </div>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                {policy.lifecycleStatus === "DRAFT" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runLifecycleAction(submitPolicyForReview)}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Submit for review
                  </button>
                )}
                {isAdmin && policy.lifecycleStatus === "IN_REVIEW" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runLifecycleAction(approvePolicyDraft)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {isAdmin && policy.lifecycleStatus === "APPROVED" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runLifecycleAction(publishPolicyDraft)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
                {isAdmin && policy.lifecycleStatus === "PUBLISHED" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runLifecycleAction(retirePolicyDraft)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Retire
                  </button>
                )}
              </div>
            )}

            {canEdit && (
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="policy-review-due" className="font-semibold text-slate-600">
                  Review due
                </label>
                <input
                  id="policy-review-due"
                  type="date"
                  value={reviewDueDateDraft}
                  onChange={(e) => setReviewDueDateDraft(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={saveReviewDueDate}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Set
                </button>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowVersions((v) => !v)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {showVersions ? "Hide" : "Show"} version history ({policy.versions.length})
              </button>
              {showVersions && (
                <ul className="mt-2 flex flex-col gap-2">
                  {policy.versions.map((v) => (
                    <li key={v.versionNumber} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="font-semibold text-slate-700">
                        v{v.versionNumber} — {v.authorName} — {v.createdAt}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-slate-600">{v.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(policy.lifecycleStatus === "PUBLISHED" || policy.lifecycleStatus === "RETIRED") && (
              <div>
                <div className="mb-1 text-xs font-bold text-slate-700">Acknowledged by</div>
                {people.length === 0 ? (
                  <p className="text-xs text-slate-500">No one in this workspace&apos;s People directory yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {people.map((person) => {
                      const ack = policy.acknowledgements.find((a) => a.personId === person.id);
                      return (
                        <li key={person.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700">
                            {person.name}
                            {ack && <span className="text-slate-400"> — acknowledged {ack.acknowledgedAt}</span>}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleAcknowledgement(person.id, Boolean(ack))}
                              className={`rounded-lg border px-2 py-0.5 font-semibold disabled:opacity-50 ${
                                ack
                                  ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {ack ? "Unmark" : "Mark acknowledged"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
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
