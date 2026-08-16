"use client";

import { useState, useTransition } from "react";
import { reviewProcessWithAI } from "@/lib/actions/ai-review";
import type { ProcessReviewResult } from "@/lib/ai/process-review";

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

export function ReviewPanel({ workspaceId, processId }: { workspaceId: string; processId: string }) {
  const [result, setResult] = useState<ProcessReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      setResult(outcome.data);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={runReview}
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Reviewing…" : result ? "Run AI review again" : "Run AI review"}
      </button>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {result.summary}
          </p>

          {result.findings.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No gaps or risks found.
            </p>
          ) : (
            <ul className="space-y-3">
              {result.findings.map((finding, i) => (
                <li
                  key={i}
                  className={`rounded-xl border px-4 py-3 ${SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.low}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${CATEGORY_STYLES[finding.category] ?? ""}`}
                    >
                      {finding.category}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                      {AREA_LABEL[finding.area] ?? finding.area}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                      {finding.severity} severity
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-900">{finding.title}</div>
                  <p className="mt-1 text-sm text-slate-700">{finding.description}</p>
                  <p className="mt-1.5 text-sm font-medium text-slate-800">→ {finding.recommendation}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
