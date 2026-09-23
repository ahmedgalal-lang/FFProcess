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
} from "@/lib/actions/governance";
import { GovernancePolicyDrawer, type PolicyT } from "./governance-policy-drawer";
import { GovernanceRiskRegister, type RiskT } from "./governance-risk-register";
import { GovernancePolicyLibrary } from "./governance-policy-library";
import { GOVERNANCE_FOCUS_AREAS as FOCUS_AREAS } from "@/lib/domain/governance-focus-areas";

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
 * focus-area tabs switch which assessment's summary/checklist is shown, and
 * the Risk Register / Policy Library are workspace-wide — not scoped to the
 * active tab — so they're rendered here too rather than switching with it.
 */
export function GovernanceAssessmentPanel({
  workspaceId,
  hasProfile,
  assessmentsByFocusArea,
  risks,
  allPolicies,
  initialFocusArea = "RISK_CONTROLS",
}: {
  workspaceId: string;
  hasProfile: boolean;
  assessmentsByFocusArea: Record<string, AssessmentT>;
  risks: RiskT[];
  allPolicies: PolicyT[];
  initialFocusArea?: (typeof FOCUS_AREAS)[number]["value"];
}) {
  const canEdit = useCanEdit();
  const [focusArea, setFocusArea] = useState<string>(initialFocusArea);
  const [openPolicyId, setOpenPolicyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const assessment = assessmentsByFocusArea[focusArea] ?? null;
  const focusLabel = FOCUS_AREAS.find((f) => f.value === focusArea)?.label ?? focusArea;

  const openPolicy = useMemo(
    () => allPolicies.find((p) => p.id === openPolicyId) ?? null,
    [allPolicies, openPolicyId]
  );

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateGovernanceAssessment({ workspaceId, focusArea: focusArea as never });
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

  function submitNewItem(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    setError(null);
    startTransition(async () => {
      const result = await addGovernanceChecklistItem({
        workspaceId,
        focusArea: focusArea as never,
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

  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    items: (assessment?.items ?? []).filter((i) => i.phase === phase && i.status !== "DISMISSED"),
  }));

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
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Governance focus area">
            {FOCUS_AREAS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={focusArea === f.value}
                onClick={() => {
                  setFocusArea(f.value);
                  setAddingItem(false);
                  setEditingItemId(null);
                  setConfirmingDeleteId(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  focusArea === f.value
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
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

      {assessment && assessment.summary.trim() !== "" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Executive summary — {focusLabel}</h2>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
            {assessment.summary}
          </p>
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

      <GovernanceRiskRegister workspaceId={workspaceId} risks={risks} />
      <GovernancePolicyLibrary workspaceId={workspaceId} policies={allPolicies} onOpen={setOpenPolicyId} />

      <GovernancePolicyDrawer
        key={openPolicy?.id ?? "none"}
        workspaceId={workspaceId}
        policy={openPolicy}
        onClose={() => setOpenPolicyId(null)}
      />
    </div>
  );
}
