"use client";

import type { PolicyT } from "./governance-policy-drawer";

const STATUS_LABEL: Record<string, string> = { OPEN: "Draft", EDITED: "Edited" };
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  EDITED: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

/**
 * Every draft policy across every focus area, in one place (FR-013) — not
 * just the ones reachable by clicking through a checklist. `policies` is a
 * flat read across every GovernanceAssessment's checklist items in the
 * workspace; no dedicated query or table of its own (data-model.md's "Policy
 * library — a view, not a new table").
 */
export function GovernancePolicyLibrary({
  policies,
  onOpen,
}: {
  policies: PolicyT[];
  onOpen: (policyId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">Policy library</h2>
      <p className="mb-3 text-xs text-slate-500">
        Every draft policy across every focus area, in one place — not just the ones linked from one
        focus area&apos;s checklist.
      </p>
      {policies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          No policies drafted yet. Generating an assessment that recommends one will add it here.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {policies.map((policy) => (
            <button
              key={policy.id}
              type="button"
              onClick={() => onOpen(policy.id)}
              className="flex items-center gap-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{policy.title}</span>
                <span className="block text-[11px] text-slate-500">
                  {policy.focusAreaLabel} · updated {policy.updatedAt}
                </span>
              </span>
              <span
                className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${STATUS_STYLE[policy.status] ?? STATUS_STYLE["OPEN"]}`}
              >
                {STATUS_LABEL[policy.status] ?? policy.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
