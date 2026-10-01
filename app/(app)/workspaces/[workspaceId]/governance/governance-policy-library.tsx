"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addGovernancePolicy } from "@/lib/actions/governance";
import type { PolicyT } from "./governance-policy-drawer";
import { SectionGuide } from "./section-guide";
import { useMessages } from "@/lib/i18n/client";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  EDITED: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const LIFECYCLE_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  IN_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RETIRED: "bg-slate-100 text-slate-500 border-slate-200",
};

/**
 * Every policy across every focus area, in one place (FR-013) — not just the
 * ones reachable by clicking through a checklist.
 *
 * A policy can also start here, written by hand with no assessment behind it,
 * which is the same parity the Risk Register already gives a hand-added risk
 * (FR-012): a consultant who knows the client needs a policy should not have
 * to generate an assessment first to get somewhere to put it.
 */
export function GovernancePolicyLibrary({
  workspaceId,
  policies,
  onOpen,
}: {
  workspaceId: string;
  policies: PolicyT[];
  onOpen: (policyId: string) => void;
}) {
  const canEdit = useCanEdit();
  const m = useMessages();
  const g = m.governance;
  const t = g.library;
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submitNewPolicy(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    if (!title || !body) return;
    startTransition(async () => {
      const result = await addGovernancePolicy({ workspaceId, title, body });
      if (result.ok) {
        setAdding(false);
        router.refresh();
      }
    });
  }

  return (
    <section id="policy-library" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-900">{t.title}</h2>
            <SectionGuide id="policy" />
          </div>
          <p className="text-xs text-slate-500">{t.intro}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            {t.add}
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNewPolicy(e.currentTarget);
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <input
            name="title"
            required
            placeholder={t.titlePlaceholder}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <textarea
            name="body"
            required
            rows={6}
            placeholder={t.bodyPlaceholder}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="ms-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {pending ? t.adding : m.common.add}
            </button>
          </div>
        </form>
      )}

      {policies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          {t.none}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {policies.map((policy) => (
            <button
              key={policy.id}
              type="button"
              onClick={() => onOpen(policy.id)}
              className="flex items-center gap-3 py-2.5 text-start hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500"
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
                  {policy.governsAspectName ? (
                    <span className="font-semibold text-indigo-700">
                      {t.governs(g.aspectNames[policy.governsAspectName] ?? policy.governsAspectName)}
                    </span>
                  ) : (
                    (policy.focusAreaLabel ? (g.aspectNames[policy.focusAreaLabel] ?? policy.focusAreaLabel) : g.addedManually)
                  )}{" "}
                  · {t.updated(policy.updatedAt)}
                </span>
              </span>
              {policy.needsReview && (
                <span className="flex-none rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-red-700">
                  {t.needsReview}
                </span>
              )}
              <span
                className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${LIFECYCLE_STYLE[policy.lifecycleStatus]}`}
              >
                {g.lifecycle[policy.lifecycleStatus]}
              </span>
              <span
                className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${STATUS_STYLE[policy.status] ?? STATUS_STYLE["OPEN"]}`}
              >
                {t.statuses[policy.status] ?? policy.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
