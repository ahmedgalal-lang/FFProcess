"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reviewProcessWithAI,
  updateReviewFinding,
  deleteReviewFinding,
  integrateReviewFinding,
  type PersistedReviewFinding,
} from "@/lib/actions/ai-review";

const AREA_LABEL: Record<string, string> = {
  process_map: "Process Map",
  raci: "RACI Matrix",
  authority: "Authority Matrix",
  general: "General",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

const CATEGORY_STYLES: Record<string, string> = {
  gap: "bg-indigo-100 text-indigo-700",
  risk: "bg-red-100 text-red-700",
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  EDITED: "bg-amber-100 text-amber-700",
  INTEGRATED: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABEL: Record<string, string> = { OPEN: "New", EDITED: "Edited", INTEGRATED: "Integrated" };

type StepT = { id: string; type: "START" | "TASK" | "DECISION" | "END"; label: string };

export function ReviewPanel({
  workspaceId,
  processId,
  workspaceIndustry,
  initialFindings,
  steps,
}: {
  workspaceId: string;
  processId: string;
  workspaceIndustry: string | null;
  initialFindings: PersistedReviewFinding[];
  steps: StepT[];
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [integratingId, setIntegratingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function runReview() {
    setError(null);
    startTransition(async () => {
      const outcome = await reviewProcessWithAI({ workspaceId, processId });
      if (!outcome.ok) {
        setError(
          outcome.error === "AI_UNAVAILABLE" || outcome.error === "VALIDATION_ERROR"
            ? (outcome.message ?? "Could not run the AI review.")
            : outcome.error
        );
        return;
      }
      setSummary(outcome.data.summary);
      setFindings(outcome.data.findings);
      router.refresh();
    });
  }

  function saveEdit(id: string, edited: { title: string; description: string; recommendation: string }) {
    startTransition(async () => {
      const outcome = await updateReviewFinding({ workspaceId, findingId: id, ...edited });
      if (outcome.ok) {
        setFindings((prev) => prev.map((f) => (f.id === id ? outcome.data : f)));
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const outcome = await deleteReviewFinding({ workspaceId, findingId: id });
      if (outcome.ok) {
        setFindings((prev) => prev.filter((f) => f.id !== id));
        router.refresh();
      }
    });
  }

  function integrate(id: string, stepId: string, mode: "MERGED" | "REPLACED") {
    startTransition(async () => {
      const outcome = await integrateReviewFinding({ workspaceId, findingId: id, stepId, mode });
      if (outcome.ok) {
        setFindings((prev) => prev.map((f) => (f.id === id ? outcome.data : f)));
        setIntegratingId(null);
        router.refresh();
      }
    });
  }

  const openCount = findings.filter((f) => f.status !== "INTEGRATED").length;
  const integratedCount = findings.filter((f) => f.status === "INTEGRATED").length;

  return (
    <div>
      {workspaceIndustry && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-indigo-50 text-sm text-indigo-700">
            ⚕
          </span>
          <div className="text-sm">
            <div className="font-semibold text-slate-900">Reviewed against {workspaceIndustry} norms</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Findings weigh this process against how it&apos;s typically run in your industry, not a generic
              checklist.
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={runReview}
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Reviewing…" : findings.length > 0 ? "Run AI review again" : "Run AI review"}
        </button>
        {findings.length > 0 && (
          <span className="text-xs text-slate-400">
            {openCount} open · {integratedCount} integrated
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {summary && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {summary}
        </p>
      )}

      {findings.length === 0 ? (
        summary && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No gaps or risks found.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              steps={steps}
              editing={editingId === finding.id}
              integrating={integratingId === finding.id}
              pending={pending}
              onStartEdit={() => setEditingId(finding.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(edited) => saveEdit(finding.id, edited)}
              onDelete={() => remove(finding.id)}
              onStartIntegrate={() => setIntegratingId(finding.id)}
              onCancelIntegrate={() => setIntegratingId(null)}
              onIntegrate={(stepId, mode) => integrate(finding.id, stepId, mode)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  steps,
  editing,
  integrating,
  pending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onStartIntegrate,
  onCancelIntegrate,
  onIntegrate,
}: {
  finding: PersistedReviewFinding;
  steps: StepT[];
  editing: boolean;
  integrating: boolean;
  pending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (edited: { title: string; description: string; recommendation: string }) => void;
  onDelete: () => void;
  onStartIntegrate: () => void;
  onCancelIntegrate: () => void;
  onIntegrate: (stepId: string, mode: "MERGED" | "REPLACED") => void;
}) {
  const [title, setTitle] = useState(finding.title);
  const [description, setDescription] = useState(finding.description);
  const [recommendation, setRecommendation] = useState(finding.recommendation);
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id ?? "");

  const integrated = finding.status === "INTEGRATED";

  return (
    <li className={`rounded-xl border px-4 py-3 ${SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.low} ${integrated ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${CATEGORY_STYLES[finding.category] ?? ""}`}>
          {finding.category}
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {AREA_LABEL[finding.area] ?? finding.area}
        </span>
        <span className="text-[10px] font-semibold tracking-wide uppercase opacity-70">{finding.severity} severity</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[finding.status]}`}>
          {STATUS_LABEL[finding.status]}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">Recommendation</label>
            <textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onSaveEdit({ title, description, recommendation })}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-1.5 text-sm font-semibold text-slate-900">{finding.title}</div>
          <p className="mt-1 text-sm text-slate-700">{finding.description}</p>
          <p className="mt-1.5 text-sm font-medium text-slate-800">→ {finding.recommendation}</p>

          {integrated ? (
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-dashed border-current/20 pt-2.5 text-xs font-medium text-emerald-700">
              ✓ {finding.integrationMode === "MERGED" ? "Merged into" : "Replaced"}{" "}
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold">{finding.integratedStepLabel}</span>
              {finding.integrationMode === "MERGED" ? " as a note" : ""}
            </div>
          ) : (
            <div className="mt-2.5 flex gap-3 border-t border-dashed border-current/20 pt-2.5">
              <button type="button" onClick={onStartEdit} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                Edit
              </button>
              {steps.length > 0 && (
                <button
                  type="button"
                  onClick={integrating ? onCancelIntegrate : onStartIntegrate}
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  {integrating ? "Cancel integrate" : "Integrate into Process Map"}
                </button>
              )}
              <button type="button" onClick={onDelete} className="text-xs font-semibold text-slate-600 hover:text-red-600">
                Delete
              </button>
            </div>
          )}

          {integrating && (
            <div className="mt-2.5 border-t border-dashed border-current/20 pt-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-semibold text-slate-600">Target step:</label>
                <select
                  value={selectedStepId}
                  onChange={(e) => setSelectedStepId(e.target.value)}
                  className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {steps.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.type}] {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !selectedStepId}
                  onClick={() => onIntegrate(selectedStepId, "MERGED")}
                  className="flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs hover:border-indigo-400 disabled:opacity-40"
                >
                  <div className="font-bold text-indigo-700">Merge into step</div>
                  <div className="mt-0.5 text-slate-500">Keeps the step as-is and appends this as a note. Nothing is deleted.</div>
                </button>
                <button
                  type="button"
                  disabled={pending || !selectedStepId}
                  onClick={() => onIntegrate(selectedStepId, "REPLACED")}
                  className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-xs hover:border-red-400 disabled:opacity-40"
                >
                  <div className="font-bold text-red-700">Replace step</div>
                  <div className="mt-0.5 text-slate-500">Overwrites the step&apos;s label with this fix. The old label is deleted, not kept.</div>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </li>
  );
}
