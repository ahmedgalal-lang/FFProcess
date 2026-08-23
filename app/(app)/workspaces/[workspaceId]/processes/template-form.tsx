"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateProcessTemplateDraft, createProcessFromTemplate } from "@/lib/actions/process-template";
import type { ProcessTemplateResult } from "@/lib/ai/process-template";

const STEP_TYPE_STYLES: Record<string, string> = {
  START: "bg-emerald-50 text-emerald-700",
  END: "bg-emerald-50 text-emerald-700",
  TASK: "bg-slate-100 text-slate-600",
  DECISION: "bg-indigo-50 text-indigo-700",
};

export function GenerateTemplateForm({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<ProcessTemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  const [creating, startCreating] = useTransition();
  const router = useRouter();

  function generate() {
    setError(null);
    setDraft(null);
    startGenerating(async () => {
      const result = await generateProcessTemplateDraft({ workspaceId, processName: topic });
      if (!result.ok) {
        setError(result.error === "AI_UNAVAILABLE" || result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not generate a draft") : result.error);
        return;
      }
      setDraft(result.data);
    });
  }

  function useDraft() {
    if (!draft) return;
    setError(null);
    startCreating(async () => {
      const result = await createProcessFromTemplate({
        workspaceId,
        processName: draft.processName,
        steps: draft.steps,
        activities: draft.activities,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not create process") : result.error);
        return;
      }
      router.push(`/workspaces/${workspaceId}/processes/${result.data.id}/map`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
      >
        ✨ Generate from best practice
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/30 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Process to draft
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Employee Onboarding, Procure to Pay"
            required
            className="w-72 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={generating || !topic.trim()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? "Drafting…" : "Generate draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDraft(null);
            setTopic("");
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Uses this workspace&rsquo;s industry/background notes for context — a starting point you refine
        afterward, not a finished process.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {draft && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{draft.processName}</h3>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Process Map</p>
            <ol className="mt-1.5 flex flex-col gap-1">
              {draft.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-4 flex-none font-mono text-slate-400">{i + 1}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STEP_TYPE_STYLES[s.type]}`}>
                    {s.type}
                  </span>
                  <span className="text-slate-800">{s.label}</span>
                  {s.roleName && <span className="text-slate-400">· {s.roleName}</span>}
                </li>
              ))}
            </ol>
          </div>

          {draft.activities.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RACI Matrix</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {draft.activities.map((a, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-slate-800">{a.name}</span>
                    <span className="text-slate-400">
                      {" — "}
                      {a.assignments.map((asn) => `${asn.roleName} (${asn.code[0]})`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={useDraft}
              disabled={creating}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating…" : "Use this draft →"}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={generating || creating}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
