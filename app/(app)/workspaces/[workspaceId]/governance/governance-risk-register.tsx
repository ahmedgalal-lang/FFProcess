"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addGovernanceRisk, updateGovernanceRisk, deleteGovernanceRisk } from "@/lib/actions/governance";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";
import { heatMapCells } from "@/lib/domain/risk-treatment";
import { RiskHeatMap, type HeatMapSelection } from "./risk-heat-map";
import { RiskTreatmentPanel } from "./risk-treatment-panel";

export type RiskT = {
  id: string;
  title: string;
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
  ownerLabel: string | null;
  sourceLabel: string | null; // focus area it came from, or null when added by hand
  /** The same focus area as sourceLabel, as its raw value — for filtering by the active tab. */
  sourceFocusArea: string | null;
  // Treatment plan (spec 027).
  treatmentStrategy: "MITIGATE" | "TRANSFER" | "ACCEPT" | "AVOID" | null;
  treatmentRationale: string | null;
  targetLikelihood: "LOW" | "MEDIUM" | "HIGH" | null;
  targetImpact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  treatmentActions: {
    id: string;
    description: string;
    ownerLabel: string | null;
    dueDate: string | null; // YYYY-MM-DD
    done: boolean;
    overdue: boolean;
  }[];
};

type OwnerOptionT = { id: string; name: string; archived: boolean };

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
  roles,
  people,
}: {
  workspaceId: string;
  risks: RiskT[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [selectedCell, setSelectedCell] = useState<HeatMapSelection>(null);
  const [treatmentOpenId, setTreatmentOpenId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
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
      const result = await updateGovernanceRisk({
        workspaceId,
        riskId,
        [field]: value,
      });
      if (result.ok) router.refresh();
    });
  }

  function removeRisk(riskId: string) {
    startTransition(async () => {
      const result = await deleteGovernanceRisk({ workspaceId, riskId });
      if (result.ok) {
        setConfirmingDeleteId(null);
        router.refresh();
      }
    });
  }

  // The map counts exactly the risks this register holds (the active tab's),
  // and a selected cell filters the table to exactly the ones it counted. A
  // selection whose cell has emptied (a tab switch, a closed risk) lapses.
  const cells = heatMapCells(risks);
  const selected = selectedCell
    ? cells.find((c) => c.likelihood === selectedCell.likelihood && c.impact === selectedCell.impact)
    : undefined;
  const activeCell = selected && selected.count > 0 ? selected : undefined;
  const shown = activeCell ? risks.filter((r) => activeCell.riskIds.includes(r.id)) : risks;
  const columnCount = canEdit ? 7 : 6;

  return (
    <section id="risk-register" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Risk register</h2>
          <p className="text-xs text-slate-500">
            Identified risks, tracked on their own — scored, owned, and carried forward independent of any one checklist
            run. Populated by an assessment or added by hand.
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
              <select
                name="likelihood"
                defaultValue="MEDIUM"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Impact
              <select
                name="impact"
                defaultValue="MEDIUM"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              >
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

      {risks.length > 0 && (
        <RiskHeatMap cells={cells} selected={activeCell ? selectedCell : null} onSelect={setSelectedCell} />
      )}

      {activeCell && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-600" role="status">
          Showing {activeCell.count} risk{activeCell.count === 1 ? "" : "s"} at {capitalize(activeCell.likelihood)}{" "}
          likelihood, {capitalize(activeCell.impact)} impact.
          <button
            type="button"
            onClick={() => setSelectedCell(null)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Show all risks
          </button>
        </div>
      )}

      {risks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          No risks tracked yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Risks</caption>
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                <th className="w-2/5 pb-2 pr-2">Risk</th>
                <th className="pb-2 pr-2">Likelihood</th>
                <th className="pb-2 pr-2">Impact</th>
                <th className="pb-2 pr-2">Level</th>
                <th className="pb-2 pr-2">Owner</th>
                <th className="pb-2">Status</th>
                {canEdit && <th className="pb-2 pl-2" aria-label="Remove" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((risk) => {
                const level = deriveRiskLevel(risk.likelihood, risk.impact);
                const treatmentOpen = treatmentOpenId === risk.id;
                const overdueTreatment = risk.treatmentActions.some((a) => a.overdue);
                return (
                  <Fragment key={risk.id}>
                    <tr className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-2.5 pr-2">
                        <div className="font-semibold text-slate-900">{risk.title}</div>
                        <div className="text-slate-500">{risk.sourceLabel ?? "Added manually"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            aria-expanded={treatmentOpen}
                            onClick={() => setTreatmentOpenId(treatmentOpen ? null : risk.id)}
                            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            {treatmentOpen ? "Hide treatment" : "Treatment"}
                            <span className="sr-only">: {risk.title}</span>
                          </button>
                          {overdueTreatment && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-1.5 text-[10px] font-bold text-red-700">
                              Overdue treatment
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-slate-600">
                        {canEdit ? (
                          <select
                            value={risk.likelihood}
                            aria-label={`Likelihood: ${risk.title}`}
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
                            aria-label={`Impact: ${risk.title}`}
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
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${LEVEL_STYLE[level]}`}
                        >
                          {level}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 font-semibold text-slate-700">
                        {risk.ownerLabel ?? <span className="font-normal text-slate-500">— unassigned</span>}
                      </td>
                      <td className="py-2.5">
                        {canEdit ? (
                          <select
                            value={risk.status}
                            aria-label={`Status: ${risk.title}`}
                            onChange={(e) => updateField(risk.id, "status", e.target.value)}
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}
                          >
                            <option value="OPEN">Open</option>
                            <option value="MITIGATING">Mitigating</option>
                            <option value="ACCEPTED">Accepted</option>
                            <option value="CLOSED">Closed</option>
                          </select>
                        ) : (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}
                          >
                            {capitalize(risk.status)}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 pl-2 text-right">
                          {confirmingDeleteId === risk.id ? (
                            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] text-slate-600">
                              Delete?
                              <button
                                type="button"
                                onClick={() => removeRisk(risk.id)}
                                disabled={pending}
                                className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Keep
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(risk.id)}
                              aria-label={`Delete risk: ${risk.title}`}
                              className="text-[10px] font-semibold text-slate-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {treatmentOpen && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={columnCount} className="pb-3">
                          <RiskTreatmentPanel workspaceId={workspaceId} risk={risk} roles={roles} people={people} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
