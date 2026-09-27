"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import {
  generateGovernanceAssessment,
  setChecklistItemStatus,
  addGovernanceChecklistItem,
  updateGovernanceChecklistItem,
  deleteGovernanceChecklistItem,
  updateGovernanceSummary,
  addGovernanceAspect,
  renameGovernanceAspect,
  deleteGovernanceAspect,
} from "@/lib/actions/governance";
import { GovernancePolicyDrawer, type PolicyT } from "./governance-policy-drawer";
import { GovernanceRiskRegister, type RiskT } from "./governance-risk-register";
import { GovernancePolicyLibrary } from "./governance-policy-library";

export type AspectT = { id: string; name: string };

/**
 * Transparency and Fairness are assessed as one pillar carrying both halves,
 * rather than two that kept producing near-identical findings: disclosure
 * that reaches only some stakeholders is a fairness failure as much as a
 * transparency one. The system prompt frames them the same way.
 */
const PILLARS = [
  "Accountability",
  "Transparency & Fairness",
  "Responsibility",
  "Independence",
] as const;

const PHASE_LABEL: Record<string, string> = { IMMEDIATE: "Immediate", NEAR_TERM: "Near-term", LONG_TERM: "Long-term" };
const PHASE_ORDER = ["IMMEDIATE", "NEAR_TERM", "LONG_TERM"] as const;

export type ChecklistItemT = {
  id: string;
  phase: "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM";
  title: string;
  description: string;
  status: "OPEN" | "EDITED" | "DONE" | "DISMISSED";
  policy: PolicyT | null;
};

export type AssessmentT = {
  id: string;
  summary: string;
  updatedAtLabel: string;
  items: ChecklistItemT[];
} | null;

/**
 * The AI-assisted governance assessment: profile is set alongside this
 * (governance-profile-form.tsx, sibling in page.tsx), pillars are static,
 * and aspect tabs — a workspace's own, addable/renameable/deletable list
 * (spec 017) — switch which assessment's summary/checklist is shown. The
 * Risk Register and Policy Library are rendered here too, filtered to the
 * same active tab — a risk or policy added by hand (no assessment behind
 * it) has no tab of its own, so it stays visible under every tab rather
 * than becoming unreachable the moment another tab is selected.
 */
export function GovernanceAssessmentPanel({
  workspaceId,
  hasProfile,
  aspects,
  assessmentsByAspectId,
  risks,
  allPolicies,
}: {
  workspaceId: string;
  hasProfile: boolean;
  aspects: AspectT[];
  assessmentsByAspectId: Record<string, AssessmentT>;
  risks: RiskT[];
  allPolicies: PolicyT[];
}) {
  const canEdit = useCanEdit();
  const [aspectId, setAspectId] = useState<string>(aspects[0]?.id ?? "");
  const [openPolicyId, setOpenPolicyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [addingAspect, setAddingAspect] = useState(false);
  const [renamingAspectId, setRenamingAspectId] = useState<string | null>(null);
  const [confirmingDeleteAspectId, setConfirmingDeleteAspectId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const assessment = assessmentsByAspectId[aspectId] ?? null;
  const focusLabel = aspects.find((a) => a.id === aspectId)?.name ?? "";

  const openPolicy = useMemo(
    () => allPolicies.find((p) => p.id === openPolicyId) ?? null,
    [allPolicies, openPolicyId]
  );

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateGovernanceAssessment({ workspaceId, aspectId });
      if (!result.ok) {
        setError(
          result.error === "AI_UNAVAILABLE" || result.error === "VALIDATION_ERROR"
            ? (result.message ?? "Could not generate the assessment.")
            : result.error
        );
        return;
      }
      router.refresh();
    });
  }

  function setItemStatus(itemId: string, status: "OPEN" | "DONE" | "DISMISSED") {
    startTransition(async () => {
      const result = await setChecklistItemStatus({ workspaceId, itemId, status });
      if (result.ok) router.refresh();
    });
  }

  function submitNewAspect(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await addGovernanceAspect({ workspaceId, name });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not add.") : result.error);
        return;
      }
      setAddingAspect(false);
      setAspectId(result.data.id);
      router.refresh();
    });
  }

  function submitRenamedAspect(id: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await renameGovernanceAspect({ workspaceId, aspectId: id, name });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not rename.") : result.error);
        return;
      }
      setRenamingAspectId(null);
      router.refresh();
    });
  }

  function removeAspect(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGovernanceAspect({ workspaceId, aspectId: id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not delete.") : result.error);
        return;
      }
      setConfirmingDeleteAspectId(null);
      // Deleting the aspect currently being viewed moves the view to
      // whatever remains, rather than a tab for something now gone (FR-010).
      if (id === aspectId) {
        const remaining = aspects.filter((a) => a.id !== id);
        setAspectId(remaining[0]?.id ?? "");
      }
      router.refresh();
    });
  }

  function submitNewItem(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    setError(null);
    startTransition(async () => {
      const result = await addGovernanceChecklistItem({
        workspaceId,
        aspectId,
        phase: String(data.get("phase") ?? "IMMEDIATE") as "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM",
        title,
        description,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not add.") : result.error);
        return;
      }
      setAddingItem(false);
      router.refresh();
    });
  }

  function submitEditedItem(itemId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    setError(null);
    startTransition(async () => {
      const result = await updateGovernanceChecklistItem({
        workspaceId,
        itemId,
        phase: String(data.get("phase") ?? "IMMEDIATE") as "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM",
        title,
        description,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : result.error);
        return;
      }
      setEditingItemId(null);
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGovernanceChecklistItem({ workspaceId, itemId });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not delete.") : result.error);
        return;
      }
      setConfirmingDeleteId(null);
      router.refresh();
    });
  }

  function saveSummary() {
    if (!assessment) return;
    const summary = summaryDraft.trim();
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await updateGovernanceSummary({ workspaceId, assessmentId: assessment.id, summary });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : result.error);
        return;
      }
      setEditingSummary(false);
      router.refresh();
    });
  }

  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    items: (assessment?.items ?? []).filter((i) => i.phase === phase && i.status !== "DISMISSED"),
  }));

  // Scoped to the active tab — a risk/policy with no source (added by hand)
  // belongs to no tab, so it stays visible everywhere rather than vanishing.
  const risksForTab = risks.filter((r) => r.sourceFocusArea === null || r.sourceFocusArea === aspectId);
  const policiesForTab = allPolicies.filter((p) => p.focusArea === null || p.focusArea === aspectId);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-slate-900">Evaluated against four pillars</h2>
        <p className="mb-3 text-xs text-slate-500">
          Every summary is framed against these, not left as an unstructured paragraph.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PILLARS.map((pillar) => (
            <div key={pillar} className="rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-center">
              <div className="text-[10.5px] font-bold text-slate-900">{pillar}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3" data-testid="aspect-toolbar">
            {/* ARIA requires a tablist's only children be role="tab" elements
                (aria-required-children) — rename/delete/add controls live in
                a separate toolbar below, never nested inside this div. */}
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Governance focus area">
              {aspects.map((aspect) => (
                <button
                  key={aspect.id}
                  type="button"
                  role="tab"
                  aria-selected={aspectId === aspect.id}
                  onClick={() => {
                    setAspectId(aspect.id);
                    setAddingItem(false);
                    setEditingItemId(null);
                    setConfirmingDeleteId(null);
                    setEditingSummary(false);
                    setRenamingAspectId(null);
                    setConfirmingDeleteAspectId(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    aspectId === aspect.id
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {aspect.name}
                </button>
              ))}
            </div>
            {canEdit &&
              (addingAspect ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitNewAspect(e.currentTarget);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    name="name"
                    required
                    placeholder="Aspect name"
                    aria-label="Aspect name"
                    autoFocus
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="submit" disabled={pending} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingAspect(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingAspect(true)}
                  className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  + Add aspect
                </button>
              ))}
            {canEdit && aspectId ? (
              renamingAspectId === aspectId ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRenamedAspect(aspectId, e.currentTarget);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    name="name"
                    required
                    defaultValue={focusLabel}
                    aria-label="Aspect name"
                    autoFocus
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="submit" disabled={pending} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingAspectId(null)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </form>
              ) : confirmingDeleteAspectId === aspectId ? (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  Delete &ldquo;{focusLabel}&rdquo;?
                  <button
                    type="button"
                    onClick={() => removeAspect(aspectId)}
                    disabled={pending}
                    className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteAspectId(null)}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setRenamingAspectId(aspectId)}
                    aria-label={`Rename ${focusLabel}`}
                    title="Rename"
                    className="rounded p-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteAspectId(aspectId)}
                    aria-label={`Delete ${focusLabel}`}
                    title="Delete"
                    className="rounded p-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </span>
              )
            ) : null}
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              {assessment && <span className="text-xs text-slate-500">Last generated {assessment.updatedAtLabel}</span>}
              <button
                type="button"
                onClick={regenerate}
                disabled={pending || !hasProfile}
                title={hasProfile ? undefined : "Set the governance profile above first"}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? "Generating…" : assessment ? "Regenerate" : "Generate assessment"}
              </button>
            </div>
          )}
        </div>
        {!hasProfile && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Set this workspace&apos;s company size, industry, and jurisdiction above before generating an
            assessment.
          </p>
        )}
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      </section>

      {assessment && (assessment.summary.trim() !== "" || canEdit) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Executive summary — {focusLabel}</h2>
            {canEdit && !editingSummary && (
              <button
                type="button"
                onClick={() => {
                  setSummaryDraft(assessment.summary);
                  setError(null);
                  setEditingSummary(true);
                }}
                className="flex-none text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {assessment.summary.trim() ? "Edit" : "Write one by hand"}
              </button>
            )}
          </div>
          {editingSummary ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={6}
                aria-label="Executive summary"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-[13px] leading-relaxed text-slate-800"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveSummary}
                  disabled={pending}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSummary(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {error && <span className="text-xs font-medium text-red-600">{error}</span>}
              </div>
            </div>
          ) : assessment.summary.trim() !== "" ? (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
              {assessment.summary}
            </p>
          ) : (
            <p className="mt-2 text-[13px] italic text-slate-400">No summary yet.</p>
          )}
        </section>
      )}

      {assessment ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Governance checklist</h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => setAddingItem((v) => !v)}
                className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
              >
                + Add item
              </button>
            )}
          </div>

          {addingItem && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitNewItem(e.currentTarget);
              }}
              className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <input
                name="title"
                required
                placeholder="Action title"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <textarea
                name="description"
                required
                rows={2}
                placeholder="What to do, and why it matters"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  When
                  <select name="phase" defaultValue="IMMEDIATE" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="NEAR_TERM">Near-term</option>
                    <option value="LONG_TERM">Long-term</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {grouped.map(({ phase, items }) => (
              <div key={phase}>
                <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {PHASE_LABEL[phase]}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                    {items.length}
                  </span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map((item) =>
                    editingItemId === item.id ? (
                      <li key={item.id} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitEditedItem(item.id, e.currentTarget);
                          }}
                          className="flex flex-col gap-1.5"
                        >
                          <input
                            name="title"
                            required
                            defaultValue={item.title}
                            aria-label="Action title"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                          />
                          <textarea
                            name="description"
                            required
                            defaultValue={item.description}
                            rows={2}
                            aria-label="Action description"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              name="phase"
                              defaultValue={item.phase}
                              aria-label="When"
                              className="rounded-lg border border-slate-300 px-2 py-1 text-[10px]"
                            >
                              <option value="IMMEDIATE">Immediate</option>
                              <option value="NEAR_TERM">Near-term</option>
                              <option value="LONG_TERM">Long-term</option>
                            </select>
                            <button
                              type="submit"
                              disabled={pending}
                              className="ml-auto rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={item.id}
                        className={`rounded-lg border p-2.5 ${item.status === "DONE" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex items-start gap-2">
                          {canEdit && (
                            <button
                              type="button"
                              aria-pressed={item.status === "DONE"}
                              aria-label="Mark done"
                              onClick={() => setItemStatus(item.id, item.status === "DONE" ? "OPEN" : "DONE")}
                              className={`mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-2 ${
                                item.status === "DONE" ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white"
                              }`}
                            >
                              {item.status === "DONE" && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold ${item.status === "DONE" ? "text-slate-500 line-through" : "text-slate-900"}`}>
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{item.description}</div>
                            {item.policy && (
                              <button
                                type="button"
                                onClick={() => setOpenPolicyId(item.policy!.id)}
                                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                              >
                                View draft policy →
                              </button>
                            )}
                            {canEdit && confirmingDeleteId === item.id && (
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-600">
                                Delete this item?
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  disabled={pending}
                                  className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteId(null)}
                                  className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Keep
                                </button>
                              </div>
                            )}
                          </div>
                          {canEdit && confirmingDeleteId !== item.id && (
                            <div className="flex flex-none flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingItemId(item.id)}
                                className="text-[10px] font-semibold text-slate-500 hover:text-indigo-600"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemStatus(item.id, "DISMISSED")}
                                className="text-[10px] font-semibold text-slate-500 hover:text-slate-600"
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(item.id)}
                                className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  )}
                  {items.length === 0 && (
                    <li className="rounded-lg border border-dashed border-slate-200 px-2.5 py-4 text-center text-[11px] text-slate-500">
                      Nothing here.
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No assessment generated yet for {focusLabel}.{" "}
            {canEdit ? 'Click "Generate assessment" above, or add a checklist item by hand.' : "Ask an editor to generate one."}
          </p>
          {canEdit && (
            <div className="mx-auto mt-4 max-w-md text-left">
              {addingItem ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitNewItem(e.currentTarget);
                  }}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <input
                    name="title"
                    required
                    placeholder="Action title"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <textarea
                    name="description"
                    required
                    rows={2}
                    placeholder="What to do, and why it matters"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      When
                      <select name="phase" defaultValue="IMMEDIATE" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                        <option value="IMMEDIATE">Immediate</option>
                        <option value="NEAR_TERM">Near-term</option>
                        <option value="LONG_TERM">Long-term</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAddingItem(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItem(true)}
                  className="mx-auto flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                >
                  + Add a checklist item by hand
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <GovernanceRiskRegister workspaceId={workspaceId} risks={risksForTab} />
      <GovernancePolicyLibrary workspaceId={workspaceId} policies={policiesForTab} onOpen={setOpenPolicyId} />

      <GovernancePolicyDrawer
        key={openPolicy?.id ?? "none"}
        workspaceId={workspaceId}
        policy={openPolicy}
        onClose={() => setOpenPolicyId(null)}
      />
    </div>
  );
}
