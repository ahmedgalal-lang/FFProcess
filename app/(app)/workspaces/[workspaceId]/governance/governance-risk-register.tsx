"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addGovernanceRisk, updateGovernanceRisk } from "@/lib/actions/governance";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";

export type RiskT = {
  id: string;
  title: string;
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
  ownerLabel: string | null;
  sourceLabel: string | null; // focus area it came from, or null when added by hand
};

const LEVEL_STYLE: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  MITIGATING: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-slate-100 text-slate-500",
  CLOSED: "bg-emerald-100 text-emerald-700",
};

/**
 * Identified risks, tracked on their own — scored, owned, and carried
 * forward independent of any one checklist run (FR-011). A risk surfaced by
 * an assessment and one added by hand are functionally identical here
 * (FR-012); the only difference shown is the source label.
 */
export function GovernanceRiskRegister({
  workspaceId,
  risks,
}: {
  workspaceId: string;
  risks: RiskT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submitNewRisk(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    startTransition(async () => {
      const result = await addGovernanceRisk({
        workspaceId,
        title,
        description,
        likelihood: String(data.get("likelihood") ?? "MEDIUM") as RiskT["likelihood"],
        impact: String(data.get("impact") ?? "MEDIUM") as RiskT["impact"],
      });
      if (result.ok) {
        setAdding(false);
        router.refresh();
      }
    });
  }

  function updateField(riskId: string, field: "status" | "likelihood" | "impact", value: string) {
    startTransition(async () => {
      const result = await updateGovernanceRisk({ workspaceId, riskId, [field]: value });
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Risk register</h2>
          <p className="text-xs text-slate-500">
            Identified risks, tracked on their own — scored, owned, and carried forward independent of
            any one checklist run. Populated by an assessment or added by hand.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Add risk
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNewRisk(e.currentTarget);
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <input
            name="title"
            required
            placeholder="Risk title"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <textarea
            name="description"
            required
            rows={2}
            placeholder="What could go wrong, and why it matters"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Likelihood
              <select name="likelihood" defaultValue="MEDIUM" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Impact
              <select name="impact" defaultValue="MEDIUM" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
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

      {risks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          No risks tracked yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="w-2/5 pb-2 pr-2">Risk</th>
                <th className="pb-2 pr-2">Likelihood</th>
                <th className="pb-2 pr-2">Impact</th>
                <th className="pb-2 pr-2">Level</th>
                <th className="pb-2 pr-2">Owner</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) => {
                const level = deriveRiskLevel(risk.likelihood, risk.impact);
                return (
                  <tr key={risk.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-slate-900">{risk.title}</div>
                      <div className="text-slate-500">{risk.sourceLabel ?? "Added manually"}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-slate-600">
                      {canEdit ? (
                        <select
                          value={risk.likelihood}
                          onChange={(e) => updateField(risk.id, "likelihood", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                        </select>
                      ) : (
                        capitalize(risk.likelihood)
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-slate-600">
                      {canEdit ? (
                        <select
                          value={risk.impact}
                          onChange={(e) => updateField(risk.id, "impact", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      ) : (
                        capitalize(risk.impact)
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${LEVEL_STYLE[level]}`}>
                        {level}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 font-semibold text-slate-700">
                      {risk.ownerLabel ?? <span className="font-normal text-slate-400">— unassigned</span>}
                    </td>
                    <td className="py-2.5">
                      {canEdit ? (
                        <select
                          value={risk.status}
                          onChange={(e) => updateField(risk.id, "status", e.target.value)}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}
                        >
                          <option value="OPEN">Open</option>
                          <option value="MITIGATING">Mitigating</option>
                          <option value="ACCEPTED">Accepted</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}>
                          {capitalize(risk.status)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
