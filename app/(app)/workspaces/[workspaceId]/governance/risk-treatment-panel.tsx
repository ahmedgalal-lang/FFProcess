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

type OwnerOptionT = { id: string; name: string; archived: boolean };

const STRATEGY_LABEL: Record<string, string> = {
  MITIGATE: "Mitigate",
  TRANSFER: "Transfer",
  ACCEPT: "Accept",
  AVOID: "Avoid",
};

const word = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : (result.error ?? "Could not save."));
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
        <span className="font-semibold">Current level:</span> {word(deriveRiskLevel(risk.likelihood, risk.impact))}
        {targetLevel && (
          <>
            {" "}
            → <span className="font-semibold">target:</span> {word(targetLevel)} ({word(risk.targetLikelihood!)} likelihood,{" "}
            {word(risk.targetImpact!)} impact)
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
              Strategy
              <select name="strategy" defaultValue={risk.treatmentStrategy ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">Not decided</option>
                {Object.entries(STRATEGY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Target likelihood
              <select name="targetLikelihood" defaultValue={risk.targetLikelihood ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">—</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Target impact
              <select name="targetImpact" defaultValue={risk.targetImpact ?? ""} className="rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">—</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Rationale
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
            Save treatment
          </button>
        </form>
      ) : (
        <div className="text-slate-700">
          <span className="font-semibold">Strategy:</span>{" "}
          {risk.treatmentStrategy ? STRATEGY_LABEL[risk.treatmentStrategy] : "Not decided"}
          {risk.treatmentRationale && <p className="mt-1 whitespace-pre-wrap">{risk.treatmentRationale}</p>}
        </div>
      )}

      <div>
        <div className="mb-1 font-bold text-slate-700">Treatment actions</div>
        {risk.treatmentActions.length === 0 ? (
          <p className="text-slate-500">No treatment actions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {risk.treatmentActions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={a.done}
                    disabled={pending}
                    aria-label={`Done: ${a.description}`}
                    onChange={(e) => run(() => setRiskTreatmentActionDone({ workspaceId, actionId: a.id, done: e.target.checked }))}
                    className="mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className={a.done ? "text-slate-500 line-through" : "text-slate-900"}>{a.description}</div>
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-600">
                    <span>Owner: {a.ownerLabel ?? "Unassigned"}</span>
                    {a.dueDate && <span>Due {a.dueDate}</span>}
                    {a.done && <span>Done</span>}
                    {a.overdue && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-1.5 font-bold uppercase text-red-700">Overdue</span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteRiskTreatmentAction({ workspaceId, actionId: a.id }))}
                    aria-label={`Delete action: ${a.description}`}
                    className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                  >
                    Delete
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
            aria-label="New treatment action"
            placeholder="What will be done"
            className="min-w-[12rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1"
          />
          <select name="owner" aria-label="Action owner" defaultValue="" className="rounded border border-slate-300 bg-white px-1.5 py-1">
            <option value="">Unassigned</option>
            <optgroup label="Roles">
              {roles.filter((r) => !r.archived).map((r) => (
                <option key={r.id} value={`role:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="People">
              {people.filter((p) => !p.archived).map((p) => (
                <option key={p.id} value={`person:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
          <input type="date" name="dueDate" aria-label="Action due date" className="rounded border border-slate-300 bg-white px-1.5 py-1" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            Add action
          </button>
        </form>
      )}

      {error && <p className="font-medium text-red-600">{error}</p>}
    </div>
  );
}
