"use client";

import { Fragment, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addGovernanceRisk, updateGovernanceRisk, deleteGovernanceRisk } from "@/lib/actions/governance";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";
import { heatMapCells } from "@/lib/domain/risk-treatment";
import { RiskHeatMap, type HeatMapSelection } from "./risk-heat-map";
import { RiskTreatmentPanel } from "./risk-treatment-panel";
import { SectionGuide } from "./section-guide";
import { useMessages } from "@/lib/i18n/client";

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
  risks: tabRisks,
  allRisks,
  riskLevel = null,
  roles,
  people,
}: {
  workspaceId: string;
  /** The active aspect tab's risks. */
  risks: RiskT[];
  /** Every risk in the workspace, for the dashboard's level filter. */
  allRisks?: RiskT[];
  riskLevel?: "HIGH" | "MEDIUM" | "LOW" | null;
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const m = useMessages();
  const g = m.governance;
  const t = g.risk;
  const lv = (v: string) => g.levels[v] ?? v;
  const [adding, setAdding] = useState(false);
  const [selectedCell, setSelectedCell] = useState<HeatMapSelection>(null);
  const [treatmentOpenId, setTreatmentOpenId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  // From a dashboard tile: every open risk at one level, across all aspects,
  // so the count on the tile matches the rows here (spec 026).
  const risks =
    riskLevel && allRisks
      ? allRisks.filter((r) => r.status !== "CLOSED" && deriveRiskLevel(r.likelihood, r.impact) === riskLevel)
      : tabRisks;

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
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-900">{t.title}</h2>
            <SectionGuide id="risk" />
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
            submitNewRisk(e.currentTarget);
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
            name="description"
            required
            rows={2}
            placeholder={t.descriptionPlaceholder}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              {t.likelihood}
              <select
                name="likelihood"
                defaultValue="MEDIUM"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="LOW">{lv("LOW")}</option>
                <option value="MEDIUM">{lv("MEDIUM")}</option>
                <option value="HIGH">{lv("HIGH")}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              {t.impact}
              <select
                name="impact"
                defaultValue="MEDIUM"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="LOW">{lv("LOW")}</option>
                <option value="MEDIUM">{lv("MEDIUM")}</option>
                <option value="HIGH">{lv("HIGH")}</option>
                <option value="CRITICAL">{lv("CRITICAL")}</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="ms-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {m.common.add}
            </button>
          </div>
        </form>
      )}

      {riskLevel && allRisks && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-700" role="status">
          {t.showingLevel(lv(riskLevel), risks.length)}
          <button
            type="button"
            onClick={() => router.replace(`${pathname}#risk-register`, { scroll: false })}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t.showAspect}
          </button>
        </div>
      )}

      {risks.length > 0 && (
        <RiskHeatMap cells={cells} selected={activeCell ? selectedCell : null} onSelect={setSelectedCell} />
      )}

      {activeCell && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-600" role="status">
          {t.showingCell(activeCell.count, lv(activeCell.likelihood), lv(activeCell.impact))}
          <button
            type="button"
            onClick={() => setSelectedCell(null)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t.showAll}
          </button>
        </div>
      )}

      {risks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          {t.none}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <caption className="sr-only">{t.caption}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                <th className="w-2/5 pb-2 pe-2">{t.risk}</th>
                <th className="pb-2 pe-2">{t.likelihood}</th>
                <th className="pb-2 pe-2">{t.impact}</th>
                <th className="pb-2 pe-2">{t.level}</th>
                <th className="pb-2 pe-2">{t.owner}</th>
                <th className="pb-2">{t.status}</th>
                {canEdit && (
                  <th className="pb-2 ps-2">
                    <span className="sr-only">{m.common.remove}</span>
                  </th>
                )}
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
                      <td className="py-2.5 pe-2">
                        <div className="font-semibold text-slate-900">{risk.title}</div>
                        <div className="text-slate-500">{risk.sourceLabel ? (g.aspectNames[risk.sourceLabel] ?? risk.sourceLabel) : g.addedManually}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            aria-expanded={treatmentOpen}
                            onClick={() => setTreatmentOpenId(treatmentOpen ? null : risk.id)}
                            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            {treatmentOpen ? t.hideTreatment : t.treatment}
                            <span className="sr-only">: {risk.title}</span>
                          </button>
                          {overdueTreatment && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-1.5 text-[10px] font-bold text-red-700">
                              {t.overdueTreatment}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pe-2 text-slate-600">
                        {canEdit ? (
                          <select
                            value={risk.likelihood}
                            aria-label={t.likelihoodOf(risk.title)}
                            onChange={(e) => updateField(risk.id, "likelihood", e.target.value)}
                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                          >
                            <option value="LOW">{lv("LOW")}</option>
                            <option value="MEDIUM">{lv("MEDIUM")}</option>
                            <option value="HIGH">{lv("HIGH")}</option>
                          </select>
                        ) : (
                          lv(risk.likelihood)
                        )}
                      </td>
                      <td className="py-2.5 pe-2 text-slate-600">
                        {canEdit ? (
                          <select
                            value={risk.impact}
                            aria-label={t.impactOf(risk.title)}
                            onChange={(e) => updateField(risk.id, "impact", e.target.value)}
                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                          >
                            <option value="LOW">{lv("LOW")}</option>
                            <option value="MEDIUM">{lv("MEDIUM")}</option>
                            <option value="HIGH">{lv("HIGH")}</option>
                            <option value="CRITICAL">{lv("CRITICAL")}</option>
                          </select>
                        ) : (
                          lv(risk.impact)
                        )}
                      </td>
                      <td className="py-2.5 pe-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${LEVEL_STYLE[level]}`}
                        >
                          {lv(level)}
                        </span>
                      </td>
                      <td className="py-2.5 pe-2 font-semibold text-slate-700">
                        {risk.ownerLabel ?? <span className="font-normal text-slate-500">{t.unassigned}</span>}
                      </td>
                      <td className="py-2.5">
                        {canEdit ? (
                          <select
                            value={risk.status}
                            aria-label={t.statusOf(risk.title)}
                            onChange={(e) => updateField(risk.id, "status", e.target.value)}
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}
                          >
                            {(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"] as const).map((s) => (
                              <option key={s} value={s}>
                                {t.statuses[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[risk.status]}`}
                          >
                            {t.statuses[risk.status]}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 ps-2 text-end">
                          {confirmingDeleteId === risk.id ? (
                            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] text-slate-600">
                              {t.deleteQ}
                              <button
                                type="button"
                                onClick={() => removeRisk(risk.id)}
                                disabled={pending}
                                className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                              >
                                {m.common.delete}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {m.common.keep}
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(risk.id)}
                              aria-label={t.deleteRisk(risk.title)}
                              className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                            >
                              {m.common.delete}
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
