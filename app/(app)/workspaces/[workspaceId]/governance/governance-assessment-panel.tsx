"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { generateGovernanceAssessment, setChecklistItemStatus } from "@/lib/actions/governance";
import { GovernancePolicyDrawer, type PolicyT } from "./governance-policy-drawer";
import { GovernanceRiskRegister, type RiskT } from "./governance-risk-register";
import { GovernancePolicyLibrary } from "./governance-policy-library";
import { GOVERNANCE_FOCUS_AREAS as FOCUS_AREAS } from "@/lib/domain/governance-focus-areas";

const PILLARS = ["Accountability", "Transparency", "Fairness", "Responsibility", "Independence"] as const;

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

  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    items: (assessment?.items ?? []).filter((i) => i.phase === phase && i.status !== "DISMISSED"),
  }));

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-slate-900">Evaluated against five pillars</h2>
        <p className="mb-3 text-xs text-slate-500">
          Every summary is framed against these, not left as an unstructured paragraph.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
                onClick={() => setFocusArea(f.value)}
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

      {assessment ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">Executive summary — {focusLabel}</h2>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
              {assessment.summary}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-900">Governance checklist</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {grouped.map(({ phase, items }) => (
                <div key={phase}>
                  <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {PHASE_LABEL[phase]}
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                      {items.length}
                    </span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {items.map((item) => (
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
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setItemStatus(item.id, "DISMISSED")}
                              className="flex-none text-[10px] font-semibold text-slate-400 hover:text-slate-600"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="rounded-lg border border-dashed border-slate-200 px-2.5 py-4 text-center text-[11px] text-slate-400">
                        Nothing here.
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No assessment generated yet for {focusLabel}.{" "}
            {canEdit ? 'Click "Generate assessment" above.' : "Ask an editor to generate one."}
          </p>
        </section>
      )}

      <GovernanceRiskRegister workspaceId={workspaceId} risks={risks} />
      <GovernancePolicyLibrary policies={allPolicies} onOpen={setOpenPolicyId} />

      <GovernancePolicyDrawer
        key={openPolicy?.id ?? "none"}
        workspaceId={workspaceId}
        policy={openPolicy}
        onClose={() => setOpenPolicyId(null)}
      />
    </div>
  );
}
