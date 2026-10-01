"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import {
  addRiskTreatmentAction,
  deleteRiskTreatmentAction,
  setRiskTreatment,
  setRiskTreatmentActionDone,
} from "@/lib/actions/risk-treatment";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";
import type { RiskT } from "./governance-risk-register";
import { useMessages } from "@/lib/i18n/client";

type OwnerOptionT = { id: string; name: string; archived: boolean };

const STRATEGIES = ["MITIGATE", "TRANSFER", "ACCEPT", "AVOID"] as const;

/**
 * One risk's treatment plan (spec 027): the strategy and why, the level it
 * should reach once treated, and the actions that get it there. Opened from
 * the risk's row in the register.
 */
export function RiskTreatmentPanel({
  workspaceId,
  risk,
  roles,
  people,
}: {
  workspaceId: string;
  risk: RiskT;
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const m = useMessages();
  const t = m.governance.treatment;
  const word = (v: string) => m.governance.levels[v] ?? v;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? m.common.couldNotSave) : m.common.couldNotSave);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function saveTreatment(form: HTMLFormElement) {
    const data = new FormData(form);
    const pick = (name: string) => String(data.get(name) ?? "") || null;
    run(() =>
      setRiskTreatment({
        workspaceId,
        riskId: risk.id,
        strategy: pick("strategy") as "MITIGATE" | "TRANSFER" | "ACCEPT" | "AVOID" | null,
        rationale: pick("rationale"),
        targetLikelihood: pick("targetLikelihood") as "LOW" | "MEDIUM" | "HIGH" | null,
        targetImpact: pick("targetImpact") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null,
      })
    );
  }

  function addAction(form: HTMLFormElement) {
    const data = new FormData(form);
    const description = String(data.get("description") ?? "").trim();
    if (!description) return;
    const owner = String(data.get("owner") ?? "");
    const dueDate = String(data.get("dueDate") ?? "");
    run(
      () =>
        addRiskTreatmentAction({
          workspaceId,
          riskId: risk.id,
          description,
          ownerRoleId: owner.startsWith("role:") ? owner.slice(5) : null,
          ownerPersonId: owner.startsWith("person:") ? owner.slice(7) : null,
          dueDate: dueDate || null,
        }),
      () => form.reset()
    );
  }

  const targetLevel =
    risk.targetLikelihood && risk.targetImpact ? deriveRiskLevel(risk.targetLikelihood, risk.targetImpact) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="text-slate-700">
        <span className="font-semibold">{t.currentLevel}</span> {word(deriveRiskLevel(risk.likelihood, risk.impact))}
        {targetLevel && (
          <>
            {" "}
            <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> <span className="font-semibold">{t.target}</span>{" "}
            {word(targetLevel)} {t.targetDetail(word(risk.targetLikelihood!), word(risk.targetImpact!))}
          </>
        )}
      </div>

      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTreatment(e.currentTarget);
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              {t.strategy}
              <select name="strategy" defaultValue={risk.treatmentStrategy ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">{t.notDecided}</option>
                {STRATEGIES.map((v) => (
                  <option key={v} value={v}>
                    {t.strategies[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              {t.targetLikelihood}
              <select name="targetLikelihood" defaultValue={risk.targetLikelihood ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">—</option>
                <option value="LOW">{word("LOW")}</option>
                <option value="MEDIUM">{word("MEDIUM")}</option>
                <option value="HIGH">{word("HIGH")}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              {t.targetImpact}
              <select name="targetImpact" defaultValue={risk.targetImpact ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">—</option>
                <option value="LOW">{word("LOW")}</option>
                <option value="MEDIUM">{word("MEDIUM")}</option>
                <option value="HIGH">{word("HIGH")}</option>
                <option value="CRITICAL">{word("CRITICAL")}</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            {t.rationale}
            <textarea
              name="rationale"
              rows={2}
              defaultValue={risk.treatmentRationale ?? ""}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {t.save}
          </button>
        </form>
      ) : (
        <div className="text-slate-700">
          <span className="font-semibold">{t.strategyLabel}</span>{" "}
          {risk.treatmentStrategy ? t.strategies[risk.treatmentStrategy] : t.notDecided}
          {risk.treatmentRationale && <p className="mt-1 whitespace-pre-wrap">{risk.treatmentRationale}</p>}
        </div>
      )}

      <div>
        <div className="mb-1 font-bold text-slate-700">{t.actions}</div>
        {risk.treatmentActions.length === 0 ? (
          <p className="text-slate-500">{t.noActions}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {risk.treatmentActions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={a.done}
                    disabled={pending}
                    aria-label={t.doneOf(a.description)}
                    onChange={(e) => run(() => setRiskTreatmentActionDone({ workspaceId, actionId: a.id, done: e.target.checked }))}
                    className="mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className={a.done ? "text-slate-500 line-through" : "text-slate-900"}>{a.description}</div>
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-600">
                    <span>{t.owner(a.ownerLabel ?? m.common.unassigned)}</span>
                    {a.dueDate && <span>{t.due(a.dueDate)}</span>}
                    {a.done && <span>{t.done}</span>}
                    {a.overdue && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-1.5 font-bold uppercase text-red-700">{t.overdue}</span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteRiskTreatmentAction({ workspaceId, actionId: a.id }))}
                    aria-label={t.deleteAction(a.description)}
                    className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                  >
                    {m.common.delete}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addAction(e.currentTarget);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="description"
            required
            aria-label={t.newAction}
            placeholder={t.newActionPlaceholder}
            className="min-w-[12rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1"
          />
          <select name="owner" aria-label={t.actionOwner} defaultValue="" className="rounded border border-slate-300 bg-white px-1.5 py-1">
            <option value="">{m.common.unassigned}</option>
            <optgroup label={m.governance.panel.roles}>
              {roles.filter((r) => !r.archived).map((r) => (
                <option key={r.id} value={`role:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={m.governance.panel.people}>
              {people.filter((p) => !p.archived).map((p) => (
                <option key={p.id} value={`person:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
          <input type="date" name="dueDate" aria-label={t.actionDue} className="rounded border border-slate-300 bg-white px-1.5 py-1" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            {t.addAction}
          </button>
        </form>
      )}

      {error && <p className="font-medium text-red-600">{error}</p>}
    </div>
  );
}
