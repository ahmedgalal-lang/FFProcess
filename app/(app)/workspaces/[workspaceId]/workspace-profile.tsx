"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspaceProfile } from "@/lib/actions/organization";

export function WorkspaceProfile({
  workspaceId,
  industry,
  description,
}: {
  workspaceId: string;
  industry: string | null;
  description: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [industryInput, setIndustryInput] = useState(industry ?? "");
  const [descriptionInput, setDescriptionInput] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (editing) {
    return (
      <form
        className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await updateWorkspaceProfile({
              workspaceId,
              industry: industryInput,
              description: descriptionInput,
            });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid input") : result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Industry / sector
          <input
            value={industryInput}
            onChange={(e) => setIndustryInput(e.target.value)}
            placeholder="e.g. Manufacturing"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          About this organization
          <textarea
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            placeholder="Size, specific practices, sector nuances — helps AI Review tailor its suggestions to this client."
            rows={3}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryInput(industry ?? "");
              setDescriptionInput(description ?? "");
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        {industry ? (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {industry}
          </span>
        ) : (
          <span className="text-xs text-slate-500">No industry set</span>
        )}
        <p className="mt-1.5 text-sm text-slate-600">
          {description || <span className="text-slate-500">No background notes yet.</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex-none rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Edit
      </button>
    </div>
  );
}
